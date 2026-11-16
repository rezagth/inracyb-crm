import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { entryExclusion, ENTRY_EXCLUSION_LABEL, SERVICE_LABEL, serviceOf, type ServiceKey } from "@/lib/campaign";
import { hostOf, pickPublishedEmail, siteFromNotes } from "@/lib/contact-extract";
import { DIAGNOSTIC_FRESH_DAYS, RULES_VERSION, usableDiagnostic, type Probe } from "@/lib/diagnostic";
import { SEGMENTS, isSegment, segmentOfSector, type Segment } from "@/lib/diagnostic-mails";
import { enrolSlots, FEED_DEFAULTS, MAILS_PER_PROSPECT, nextCursor, parseDepartements, permanentName, readCursors, REJECT, searchPlan, type Cursor } from "@/lib/feed";
import { addDays, today } from "@/lib/format";
import { EFFECTIF_CODES, type SearchInput } from "@/lib/prospect-search";
import { checkServicePauses, crossHistories, getDailyState, optoutSet, restDays } from "./campaigns";
import { logEvent } from "./core";
import { queueDiagnostics, runDiagnostics } from "./diagnostic";
import { crawlSite, type Crawl } from "./enrich";
import { insertProspect } from "./prospect-import";
import { findPlace, placesReady, searchAnnuaire, type FoundPage } from "./prospect-search";
import { getProfile } from "./queries";

type SearchResult = { ok: true; page: FoundPage } | { ok: false; error: string };
type PlaceResult = { ok: true; phone: string; website: string } | { ok: false; error: string };

/** Accès au monde extérieur, remplaçables dans les tests. place = null : Google Places n'est pas configuré. */
export type FeedDeps = {
  search: (input: SearchInput) => Promise<SearchResult>;
  place: ((name: string, city: string, postalCode: string) => Promise<PlaceResult>) | null;
  crawl: (siteUrl: string, budgetMs: number) => Promise<Crawl>;
  probe?: Probe;
};

export type FeedSummary = { ok: boolean; ran: boolean; found: number; imported: number; completed: number; diagnosed: number; enrolled: number; rejected: number; message: string };

export async function getFeedSettings() {
  await db.insert(schema.feedSettings).values({ id: 1 }).onConflictDoNothing();
  return (await db.select().from(schema.feedSettings).where(eq(schema.feedSettings.id, 1)).limit(1))[0];
}

const ACTIVE_STAGES = ["a_completer", "a_diagnostiquer", "a_inscrire"];
const cp = (address: string) => /\b(\d{5})\b/.exec(address)?.[1] ?? "";

/**
 * Un passage de l'alimentation automatique : inscrire ce qui est prêt, chercher et importer, compléter, diagnostiquer,
 * puis inscrire de nouveau. Chaque étape s'arrête quand le temps imparti est presque écoulé ; le reste est repris au
 * passage suivant. Rien ne se passe tant que l'interrupteur global est sur « arrêt ».
 */
export async function runFeed(opts: { source?: "cron" | "manuel"; budgetMs?: number; deps?: Partial<FeedDeps> } = {}): Promise<FeedSummary> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 50_000;
  const left = () => budget - (Date.now() - started);
  const s = await getFeedSettings();
  const sum: FeedSummary = { ok: true, ran: false, found: 0, imported: 0, completed: 0, diagnosed: 0, enrolled: 0, rejected: 0, message: "" };
  if (!s.enabled) return { ...sum, message: "Alimentation arrêtée (interrupteur général)." };
  if (!s.feedDiagnostic && !s.feedAudit) return { ...sum, message: "Aucun service n'est alimenté : active le diagnostic ou l'audit." };

  const deps: FeedDeps = { search: searchAnnuaire, place: placesReady() ? findPlace : null, crawl: crawlSite, ...opts.deps };
  const t = today();
  const notes: string[] = [];
  const move = async (id: string, patch: Partial<typeof schema.feedItems.$inferInsert>) => {
    await db.update(schema.feedItems).set({ ...patch, movedOn: t }).where(eq(schema.feedItems.id, id));
  };
  const reject = async (id: string, reason: string) => {
    await move(id, { stage: "ecarte", reason });
    sum.rejected++;
  };

  try {
    sum.ran = true;
    await enrol();
    if (left() > 12_000) await searchAndImport();
    if (left() > 22_000) await enrich();
    if (s.feedDiagnostic && left() > 14_000) await diagnoseReady();
    if (left() > 3_000) await enrol();
  } catch (e) {
    console.error("alimentation : passage interrompu", e instanceof Error ? e.message : "");
    sum.ok = false;
    notes.push("Passage interrompu par une erreur : repris au prochain passage.");
  }

  sum.message = [`${sum.found} trouvée(s)`, `${sum.imported} importée(s)`, `${sum.completed} complétée(s)`, `${sum.diagnosed} diagnostiquée(s)`, `${sum.enrolled} inscrite(s)`, `${sum.rejected} écartée(s)`, ...notes].join(" · ");
  try {
    await db.insert(schema.feedRuns).values({ source: opts.source ?? "cron", ok: sum.ok, found: sum.found, imported: sum.imported, completed: sum.completed, diagnosed: sum.diagnosed, enrolled: sum.enrolled, rejected: sum.rejected, message: sum.message.slice(0, 800) });
  } catch (e) {
    console.error("alimentation : journal non enregistré", e instanceof Error ? e.message : "");
  }
  return sum;

  /** Recherche dans l'Annuaire, segment par segment, et import des entreprises nouvelles, dans la limite du jour. */
  async function searchAndImport() {
    const rows = await db.select({ name: schema.companies.name, siren: schema.companies.siren }).from(schema.companies);
    const sirens = new Set(rows.map((r) => r.siren).filter(Boolean));
    const names = new Set(rows.map((r) => r.name.trim().toLowerCase()));
    const prixAuditCents = (await getProfile()).prixAuditCents;
    const effectifs = s.effectifs.split(",").filter((c) => EFFECTIF_CODES.includes(c));
    const departements = parseDepartements(s.departements);
    const cursors = readCursors(s.cursors);
    const perDay = Math.max(0, Math.min(s.importPerSegment, 200));
    let dup = 0, blocked = 0;

    for (const segment of SEGMENTS) {
      const plan = searchPlan(segment, departements);
      if (!plan.length) continue;
      const mine = await db.select({ stage: schema.feedItems.stage, importedOn: schema.feedItems.importedOn }).from(schema.feedItems).where(eq(schema.feedItems.segment, segment));
      const stock = mine.filter((i) => ACTIVE_STAGES.includes(i.stage)).length;
      // Deux limites : le plafond d'import du jour, et un stock d'entreprises en cours de traitement qui ne dépasse pas deux jours d'import.
      let quota = Math.min(perDay - mine.filter((i) => i.importedOn === t).length, 2 * perDay - stock);
      let cur: Cursor = cursors[segment] && cursors[segment]!.combo < plan.length ? cursors[segment]! : { combo: 0, page: 1 };
      // Au plus 8 pages de l'Annuaire par segment et par passage : assez pour avancer, sans solliciter l'API à l'excès.
      for (let pages = 0; quota > 0 && pages < 8 && left() > 8_000; pages++) {
        const { sector, departement } = plan[cur.combo];
        const r = await deps.search({ offer: "audit", sector, departement, effectifs, query: "", page: cur.page });
        if (!r.ok) {
          notes.push(`Recherche interrompue : ${r.error}`);
          break;
        }
        sum.found += r.page.items.length;
        for (const c of r.page.items) {
          if (quota <= 0) break;
          if (c.blocked) { blocked++; continue; }
          if (c.inCrm || sirens.has(c.siren) || names.has(c.name.trim().toLowerCase())) { dup++; continue; }
          if (segmentOfSector(c.sector) !== segment) continue;
          const companyId = await insertProspect(c, { offer: "audit", prixAuditCents, event: "Entreprise importée par l'alimentation automatique" });
          await db.insert(schema.feedItems).values({ companyId, segment, importedOn: t, movedOn: t });
          sirens.add(c.siren);
          names.add(c.name.trim().toLowerCase());
          sum.imported++;
          quota--;
        }
        // La page n'est considérée comme lue que si elle a été parcourue en entier.
        if (quota <= 0) break;
        const next = nextCursor(cur, r.page.totalPages, plan.length);
        cur = { combo: next.combo, page: next.page };
        if (next.wrapped) break;
      }
      cursors[segment] = cur;
    }
    await db.update(schema.feedSettings).set({ cursors: JSON.stringify(cursors) }).where(eq(schema.feedSettings.id, 1));
    if (dup) notes.push(`${dup} déjà dans le CRM`);
    if (blocked) notes.push(`${blocked} opposée(s) à la prospection`);
  }

  /** Site web et téléphone (Google Places, dans la limite du quota du jour), puis adresse publiée sur le site. Jamais d'adresse devinée. */
  async function enrich() {
    let placesUsed = s.placesDay === t ? s.placesUsed : 0;
    const placesMax = Math.max(0, s.placesDaily);
    let placesDown = "";
    const items = await db.select().from(schema.feedItems).where(eq(schema.feedItems.stage, "a_completer")).orderBy(asc(schema.feedItems.tries), asc(schema.feedItems.createdAt)).limit(60);
    for (let k = 0; k < items.length && left() > 22_000; k += 3) {
      await Promise.all(
        items.slice(k, k + 3).map(async (it) => {
          const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, it.companyId)).limit(1))[0];
          if (!c) return reject(it.id, REJECT.gone);
          const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, c.id)).orderBy(desc(schema.contacts.isPrimary)).limit(1))[0];
          let site = siteFromNotes(c.notes);
          let phone = "";
          if (!site) {
            if (!deps.place) return reject(it.id, `${REJECT.noSite} (Google Places non configuré)`);
            if (placesDown || placesUsed >= placesMax) return move(it.id, { reason: placesDown || "En attente : quota Google Places du jour atteint" });
            placesUsed++;
            const p = await deps.place(c.name, c.city, cp(c.address));
            if (!p.ok) {
              placesDown = `En attente : ${p.error}`;
              return move(it.id, { reason: placesDown });
            }
            phone = p.phone.replace(/\s+/g, " ");
            if (p.website) site = /^https?:\/\//i.test(p.website) ? p.website : "https://" + p.website;
          }
          if (!site) {
            if (phone) await saveContact(c, ct, "", phone, "");
            return reject(it.id, phone ? `${REJECT.noSite} (téléphone trouvé)` : REJECT.noSite);
          }
          const crawl = await deps.crawl(site, 9_000);
          if (!crawl.pages) {
            await saveContact(c, ct, "", phone, site);
            const tries = it.tries + 1;
            return tries >= FEED_DEFAULTS.maxTries ? reject(it.id, `${REJECT.unreadable}${crawl.error ? ` (${crawl.error})` : ""}`) : move(it.id, { tries, reason: `Site illisible pour l'instant${crawl.error ? ` (${crawl.error})` : ""} : nouvel essai` });
          }
          const email = ct?.email.trim() ? "" : pickPublishedEmail(crawl.emails, hostOf(site));
          phone = phone || (crawl.phones[0] ?? "");
          await saveContact(c, ct, email, phone, site);
          if (!email && !ct?.email.trim()) return reject(it.id, phone ? `${REJECT.noEmail} (téléphone trouvé)` : REJECT.noEmail);
          sum.completed++;
          return move(it.id, { stage: s.feedDiagnostic ? "a_diagnostiquer" : "a_inscrire", reason: "", tries: 0 });
        }),
      );
    }
    await db.update(schema.feedSettings).set({ placesDay: t, placesUsed }).where(eq(schema.feedSettings.id, 1));
    if (placesDown) notes.push(placesDown.replace(/^En attente : /, "Google Places : "));
    else if (placesUsed >= placesMax && deps.place) notes.push(`Quota Google Places du jour atteint (${placesMax})`);
  }

  /** Enregistre ce qui a été trouvé, sans jamais remplacer une coordonnée déjà présente. L'adresse vient du site : origine « site ». */
  async function saveContact(c: typeof schema.companies.$inferSelect, ct: typeof schema.contacts.$inferSelect | undefined, email: string, phone: string, site: string) {
    const newEmail = ct?.email.trim() ? "" : email;
    const newPhone = ct?.phone.trim() ? "" : phone;
    const siteLine = site && !/site web\s*:/i.test(c.notes) ? `Site web : ${site}` : "";
    if (!newEmail && !newPhone && !siteLine) return;
    await db.transaction(async (tx) => {
      if (ct) {
        if (newEmail || newPhone) await tx.update(schema.contacts).set({ ...(newEmail ? { email: newEmail, emailSource: "site" } : {}), ...(newPhone ? { phone: newPhone } : {}) }).where(eq(schema.contacts.id, ct.id));
      } else if (newEmail || newPhone) {
        await tx.insert(schema.contacts).values({ companyId: c.id, firstName: "Standard", lastName: "", role: "Standard", email: newEmail, emailSource: newEmail ? "site" : "", phone: newPhone, isPrimary: true });
      }
      if (siteLine) await tx.update(schema.companies).set({ notes: [c.notes.trim(), siteLine].filter(Boolean).join("\n") }).where(eq(schema.companies.id, c.id));
      await logEvent(tx, c.id, "note", `Alimentation automatique : ${[siteLine && `site ${hostOf(site)}`, newEmail && `e-mail publié sur le site ${newEmail}`, newPhone && `téléphone ${newPhone}`].filter(Boolean).join(", ")}`);
    });
  }

  /** Diagnostic passif des entreprises complétées, par le moteur existant et sa file d'attente. */
  async function diagnoseReady() {
    const items = await db.select().from(schema.feedItems).where(eq(schema.feedItems.stage, "a_diagnostiquer")).orderBy(asc(schema.feedItems.createdAt)).limit(30);
    if (!items.length) return;
    const ids = items.map((i) => i.companyId);
    const lastOf = async () => {
      const rows = await db.select().from(schema.companyDiagnostics).where(inArray(schema.companyDiagnostics.companyId, ids)).orderBy(desc(schema.companyDiagnostics.createdAt));
      const out = new Map<string, (typeof rows)[number]>();
      for (const r of rows) if (!out.has(r.companyId)) out.set(r.companyId, r);
      return out;
    };
    const before = await lastOf();
    await queueDiagnostics(ids.filter((id) => !(before.get(id)?.status === "fait" && before.get(id)?.checkedOn === t)));
    await runDiagnostics({ budgetMs: Math.max(1, Math.min(left() - 4_000, 25_000)), probe: deps.probe });
    const after = await lastOf();
    for (const it of items) {
      const d = after.get(it.companyId);
      if (!d || d.status === "a_faire") continue; // pas encore traité : repris au passage suivant
      if (d.status === "fait") {
        sum.diagnosed++;
        await move(it.id, { stage: "a_inscrire", reason: "", tries: 0 });
      } else if (d.status === "sans_domaine") {
        if (s.feedAudit) await move(it.id, { stage: "a_inscrire", reason: "" });
        else await reject(it.id, REJECT.noDomain);
      } else {
        const tries = it.tries + 1;
        if (tries < FEED_DEFAULTS.maxTries) await move(it.id, { tries, reason: "Diagnostic en échec : nouvel essai" });
        else if (s.feedAudit) await move(it.id, { stage: "a_inscrire", reason: "" });
        else await reject(it.id, "Diagnostic impossible");
      }
    }
  }

  /**
   * Inscription dans la campagne permanente du service et du segment, avec toutes les conditions d'entrée habituelles,
   * et jamais au-delà de ce que le plafond des prochains jours peut envoyer.
   */
  async function enrol() {
    const ready = await db.select().from(schema.feedItems).where(eq(schema.feedItems.stage, "a_inscrire")).orderBy(asc(schema.feedItems.createdAt)).limit(200);
    if (!ready.length) return;
    const services: ServiceKey[] = [...(s.feedDiagnostic ? (["diagnostic"] as const) : []), ...(s.feedAudit ? (["audit"] as const) : [])];
    const status = await checkServicePauses();
    const daily = await getDailyState(t);
    const active = await db
      .select({ companyId: schema.mailCampaignItems.companyId, nextStep: schema.mailCampaignItems.nextStep, offer: schema.mailCampaigns.offer })
      .from(schema.mailCampaignItems)
      .innerJoin(schema.mailCampaigns, eq(schema.mailCampaigns.id, schema.mailCampaignItems.campaignId))
      .where(and(eq(schema.mailCampaignItems.status, "en_cours"), ne(schema.mailCampaigns.status, "terminee")));
    const inCampaign = new Set(active.map((a) => a.companyId));
    const slots = {} as Record<ServiceKey, number>;
    for (const k of services) {
      const mine = active.filter((a) => serviceOf(a.offer) === k);
      slots[k] = enrolSlots(daily[k].limit, mine.reduce((n, a) => n + Math.max(0, MAILS_PER_PROSPECT - a.nextStep), 0), mine.filter((a) => a.nextStep === 0).length);
    }
    const optouts = await optoutSet();
    const rest = restDays();
    const history = { audit: await crossHistories("audit"), diagnostic: await crossHistories("diagnostic") };
    const diagRows = await db.select().from(schema.companyDiagnostics).where(inArray(schema.companyDiagnostics.companyId, ready.map((r) => r.companyId))).orderBy(desc(schema.companyDiagnostics.createdAt));
    const campaigns = new Map<string, { id: string; status: string }>();

    type Verdict = { kind: "ok" } | { kind: "wait" | "reject"; reason: string } | { kind: "rediagnose" };
    for (const it of ready) {
      if (!isSegment(it.segment)) { await reject(it.id, "Segment inconnu"); continue; }
      const segment: Segment = it.segment;
      const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, it.companyId)).limit(1))[0];
      if (!c) { await reject(it.id, REJECT.gone); continue; }
      const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, c.id)).orderBy(desc(schema.contacts.isPrimary)).limit(1))[0];
      const cand = { id: c.id, name: c.name, stage: c.stage, email: ct?.email ?? "", emailSource: ct?.emailSource ?? "" };

      const judge = (service: ServiceKey): Verdict => {
        const ex = entryExclusion(cand, optouts, inCampaign, service, history[service].get(c.id), t, rest);
        if (ex === "deja-en-campagne" || ex === "repos") return { kind: "wait", reason: `En attente : ${ENTRY_EXCLUSION_LABEL[ex]}` };
        if (ex) return { kind: "reject", reason: `Non inscrite : ${ENTRY_EXCLUSION_LABEL[ex]}` };
        if (service === "diagnostic") {
          if (segmentOfSector(c.sector) !== segment) return { kind: "reject", reason: "Non inscrite : secteur hors du segment" };
          const d = diagRows.find((r) => r.companyId === c.id && r.status === "fait");
          if (!usableDiagnostic(d, t)) {
            const fresh = !!d && d.rulesVersion === RULES_VERSION && d.checkedOn <= t && addDays(d.checkedOn, DIAGNOSTIC_FRESH_DAYS) >= t;
            return fresh ? { kind: "reject", reason: REJECT.noHook } : { kind: "rediagnose" };
          }
          const first = (ct?.firstName ?? "").trim();
          if (!first || /^standard$/i.test(first)) return { kind: "reject", reason: REJECT.noFirstName };
        }
        if (status[service].paused) return { kind: "wait", reason: `En attente : service ${SERVICE_LABEL[service]} en pause` };
        if (slots[service] <= 0) return { kind: "wait", reason: `En attente : le plafond ${SERVICE_LABEL[service]} des prochains jours est déjà rempli` };
        return { kind: "ok" };
      };

      const verdicts = services.map((service) => ({ service, v: judge(service) }));
      const go = verdicts.find((x) => x.v.kind === "ok");
      if (go) {
        const camp = await permanentCampaign(go.service, segment);
        if (camp.status === "pause") { await move(it.id, { reason: "En attente : campagne permanente en pause" }); continue; }
        try {
          await db.insert(schema.mailCampaignItems).values({ campaignId: camp.id, companyId: c.id, nextStep: 0, nextDue: t });
        } catch {
          await move(it.id, { reason: "En attente : déjà dans une campagne en cours" });
          continue;
        }
        await logEvent(db, c.id, "mail", `Inscrite automatiquement dans la campagne « ${permanentName(go.service, segment)} »`);
        await move(it.id, { stage: "inscrit", service: go.service, reason: "" });
        inCampaign.add(c.id);
        slots[go.service]--;
        sum.enrolled++;
        continue;
      }
      const wait = verdicts.find((x) => x.v.kind === "wait");
      if (wait && wait.v.kind === "wait") { await move(it.id, { reason: wait.v.reason }); continue; }
      if (verdicts.some((x) => x.v.kind === "rediagnose")) { await move(it.id, { stage: "a_diagnostiquer", reason: "Diagnostic à refaire" }); continue; }
      const no = verdicts.find((x) => x.v.kind === "reject");
      await reject(it.id, no && no.v.kind === "reject" ? no.v.reason : "Non inscrite");
    }

    /** La campagne permanente du service et du segment : créée au besoin, recréée si tu l'as terminée. */
    async function permanentCampaign(service: ServiceKey, segment: Segment) {
      const key = service + "|" + segment;
      const known = campaigns.get(key);
      if (known) return known;
      const offer = service === "diagnostic" ? "diagnostic" : "audit";
      const found = (await db.select({ id: schema.mailCampaigns.id, status: schema.mailCampaigns.status }).from(schema.mailCampaigns).where(and(eq(schema.mailCampaigns.auto, true), eq(schema.mailCampaigns.offer, offer), eq(schema.mailCampaigns.segment, segment), ne(schema.mailCampaigns.status, "terminee"))).orderBy(desc(schema.mailCampaigns.createdAt)).limit(1))[0];
      const camp = found ?? { id: (await db.insert(schema.mailCampaigns).values({ name: permanentName(service, segment), offer, segment, auto: true }).returning({ id: schema.mailCampaigns.id }))[0].id, status: "active" };
      campaigns.set(key, camp);
      return camp;
    }
  }
}

/** Compteurs du jour et état du stock, pour la page Alimentation. */
export async function feedOverview(t = today()) {
  const s = await getFeedSettings();
  const stages = await db.select({ stage: schema.feedItems.stage, n: sql<number>`count(*)` }).from(schema.feedItems).groupBy(schema.feedItems.stage);
  const day = await db.select({ stage: schema.feedItems.stage, n: sql<number>`count(*)` }).from(schema.feedItems).where(eq(schema.feedItems.movedOn, t)).groupBy(schema.feedItems.stage);
  const importedToday = Number((await db.select({ n: sql<number>`count(*)` }).from(schema.feedItems).where(eq(schema.feedItems.importedOn, t)))[0]?.n ?? 0);
  const count = (rows: { stage: string; n: number }[], k: string) => Number(rows.find((r) => r.stage === k)?.n ?? 0);
  return {
    settings: s,
    placesReady: placesReady(),
    placesUsedToday: s.placesDay === t ? s.placesUsed : 0,
    today: { imported: importedToday, enrolled: count(day, "inscrit"), rejected: count(day, "ecarte") },
    stock: { toComplete: count(stages, "a_completer"), toDiagnose: count(stages, "a_diagnostiquer"), ready: count(stages, "a_inscrire"), enrolled: count(stages, "inscrit"), rejected: count(stages, "ecarte") },
  };
}
