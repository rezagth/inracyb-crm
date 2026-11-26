import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { entryExclusion, ENTRY_EXCLUSION_LABEL, SERVICE_LABEL, serviceOf, type CrossHistory, type ServiceKey } from "@/lib/campaign";
import { greetsWithoutName, hostOf, pickPublishedEmail, siteFromNotes } from "@/lib/contact-extract";
import { DIAGNOSTIC_FRESH_DAYS, RULES_VERSION, usableDiagnostic, type Probe } from "@/lib/diagnostic";
import { SEGMENTS, isSegment, segmentOfSector, type Segment } from "@/lib/diagnostic-mails";
import { siteCandidates } from "@/lib/site-guess";
import { enrolSlots, FEED_DEFAULTS, segmentOrder, STOCK_BEFORE_SEARCH_MS, isPhone, MAILS_PER_PROSPECT, PRESCRIBER_MAILS, missingCoordinates, nextCursor, parseDepartements, permanentName, readCursors, REJECT, searchPlan, type Cursor } from "@/lib/feed";
import { addDays, today } from "@/lib/format";
import { EFFECTIF_CODES, type SearchInput } from "@/lib/prospect-search";
import { checkServicePauses, crossHistories, getDailyState, optoutSet, reservedSectors, restDays } from "./campaigns";
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
  crawl: (siteUrl: string, budgetMs: number, siren?: string) => Promise<Crawl>;
  probe?: Probe;
};

export type FeedSummary = { ok: boolean; ran: boolean; found: number; imported: number; completed: number; diagnosed: number; enrolled: number; rejected: number; message: string };

export async function getFeedSettings() {
  await db.insert(schema.feedSettings).values({ id: 1 }).onConflictDoNothing();
  return (await db.select().from(schema.feedSettings).where(eq(schema.feedSettings.id, 1)).limit(1))[0];
}

const ACTIVE_STAGES = ["a_completer", "a_diagnostiquer", "a_inscrire"];
const cp = (address: string) => /\b(\d{5})\b/.exec(address)?.[1] ?? "";

/** Coordonnées vérifiées d'un candidat : tout est là, il manque quelque chose (écarté), ou il faut attendre (quota, panne). */
type Verified = { kind: "ok"; email: string; phone: string; site: string } | { kind: "skip"; reason: string } | { kind: "wait"; reason: string };

/**
 * Un passage de l'alimentation automatique : inscrire ce qui est prêt, vérifier les candidats de l'Annuaire (une entreprise
 * n'entre dans le CRM qu'avec une adresse mail publiée ET un téléphone), diagnostiquer, puis inscrire de nouveau. Chaque étape
 * s'arrête quand le temps imparti est presque écoulé ; le reste est repris au passage suivant. Rien ne se passe tant que
 * l'interrupteur global est sur « arrêt ».
 */
export async function runFeed(opts: { source?: "cron" | "manuel"; budgetMs?: number; /** numéro du passage du jour (1 à 5) : fait tourner l'ordre des segments */ pass?: number; deps?: Partial<FeedDeps>; /** seulement diagnostiquer et inscrire le stock déjà vérifié (tâche de 6 h 30), sans chercher */ stockOnly?: boolean } = {}): Promise<FeedSummary> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 50_000;
  const left = () => budget - (Date.now() - started);
  const s = await getFeedSettings();
  const sum: FeedSummary = { ok: true, ran: false, found: 0, imported: 0, completed: 0, diagnosed: 0, enrolled: 0, rejected: 0, message: "" };
  if (!s.enabled) return { ...sum, message: "Alimentation arrêtée (interrupteur général)." };
  if (!s.feedDiagnostic && !s.feedAudit && !s.feedPrescripteur) return { ...sum, message: "Aucun service n'est alimenté : active le diagnostic, l'audit ou les prescripteurs." };

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
  // Quota Google Places du jour, partagé par toutes les étapes du passage.
  let placesUsed = s.placesDay === t ? s.placesUsed : 0;
  const placesMax = Math.max(0, s.placesDaily);
  let placesDown = "";
  let bySiren = 0;
  const firstStage = s.feedDiagnostic ? "a_diagnostiquer" : "a_inscrire";

  try {
    sum.ran = true;
    // Le stock déjà vérifié passe en premier : la recherche de nouvelles entreprises ne doit jamais affamer le diagnostic.
    await enrol();
    // Avant une recherche, le diagnostic du stock est borné : la tâche de 6 h 30 et les passages suivants finissent le reste.
    if (s.feedDiagnostic && left() > 14_000) await diagnoseReady(opts.stockOnly ? Infinity : STOCK_BEFORE_SEARCH_MS);
    if (left() > 3_000) await enrol();
    if (!opts.stockOnly) {
      if (left() > 15_000) await recheckLegacy();
      if (left() > 15_000) await searchAndVerify();
      if (s.feedDiagnostic && left() > 14_000) await diagnoseReady();
      if (left() > 3_000) await enrol();
    }
  } catch (e) {
    console.error("alimentation : passage interrompu", e instanceof Error ? e.message : "");
    sum.ok = false;
    notes.push("Passage interrompu par une erreur : repris au prochain passage.");
  }

  try {
    await db.update(schema.feedSettings).set({ placesDay: t, placesUsed }).where(eq(schema.feedSettings.id, 1));
  } catch (e) {
    console.error("alimentation : compteur Google Places non enregistré", e instanceof Error ? e.message : "");
  }
  if (placesDown) notes.push(placesDown.replace(/^En attente : /, "Google Places : "));
  else if (deps.place && placesUsed >= placesMax) notes.push(`Quota Google Places du jour atteint (${placesMax})`);
  if (bySiren) notes.push(`${bySiren} site(s) trouvé(s) sans Google, prouvé(s) par le SIREN`);
  if (!deps.place) notes.push("Google Places non configuré : seuls les sites prouvés par le SIREN sont retenus");
  sum.message = [...(opts.stockOnly ? ["Stock"] : []), ...((opts.pass ?? 1) > 1 ? [`Passage ${opts.pass}`] : []), `${sum.found} trouvée(s)`, `${sum.imported} intégrée(s) avec mail et téléphone`, `${sum.diagnosed} diagnostiquée(s)`, `${sum.enrolled} inscrite(s)`, `${sum.rejected} écartée(s)`, ...notes].join(" · ");
  try {
    await db.insert(schema.feedRuns).values({ source: opts.source ?? "cron", ok: sum.ok, found: sum.found, imported: sum.imported, completed: sum.completed, diagnosed: sum.diagnosed, enrolled: sum.enrolled, rejected: sum.rejected, message: sum.message.slice(0, 800) });
  } catch (e) {
    console.error("alimentation : journal non enregistré", e instanceof Error ? e.message : "");
  }
  return sum;

  /**
   * Site, adresse et téléphone d'un candidat. Le site est d'abord cherché sans Google : adresses évidentes tirées du nom,
   * retenues seulement si le SIREN de l'entreprise y est publié. À défaut, Google Places (dans la limite du quota) donne
   * le site et le téléphone. L'adresse est toujours lue sur le site (générique d'abord, jamais devinée) ; adresse ET
   * téléphone sont obligatoires.
   */
  async function verify(name: string, city: string, address: string, knownSite: string, siren = "", placesCap = Infinity): Promise<Verified> {
    if (knownSite) return fromCrawl(knownSite, await readSite(knownSite), "");
    if (siren) {
      const guesses = siteCandidates(name);
      const crawls = await Promise.all(guesses.map((d) => deps.crawl("https://" + d, 8_000, siren)));
      const hit = crawls.findIndex((c) => c.pages > 0 && c.sirenFound);
      if (hit >= 0) {
        bySiren++;
        return fromCrawl("https://" + guesses[hit], crawls[hit], "");
      }
    }
    if (!deps.place) return { kind: "skip", reason: `${REJECT.noSite} (SIREN absent des sites essayés, Google Places non configuré)` };
    if (placesDown) return { kind: "wait", reason: placesDown };
    if (placesUsed >= Math.min(placesMax, placesCap)) return { kind: "wait", reason: "En attente : quota Google Places du jour atteint" };
    placesUsed++;
    const p = await deps.place(name, city, cp(address));
    if (!p.ok) {
      placesDown = `En attente : ${p.error}`;
      return { kind: "wait", reason: placesDown };
    }
    const phone = p.phone.replace(/\s+/g, " ").trim();
    const site = p.website ? (/^https?:\/\//i.test(p.website) ? p.website : "https://" + p.website) : "";
    if (!site) return { kind: "skip", reason: REJECT.noSite };
    return fromCrawl(site, await readSite(site), phone);
  }

  /** Lecture du site trouvé ; un site trop lent a droit à un second essai, plus patient, avant d'être déclaré illisible. */
  async function readSite(site: string) {
    const first = await deps.crawl(site, 9_000);
    if (first.pages || !/trop de temps/i.test(first.error ?? "")) return first;
    return deps.crawl(site, 15_000);
  }

  function fromCrawl(site: string, crawl: Crawl, googlePhone: string): Verified {
    if (!crawl.pages) return { kind: "skip", reason: `${REJECT.unreadable}${crawl.error ? ` (${crawl.error})` : ""}` };
    const email = pickPublishedEmail(crawl.emails, hostOf(site));
    const phone = isPhone(googlePhone) ? googlePhone : (crawl.phones.find(isPhone) ?? "");
    const missing = missingCoordinates(email, phone);
    return missing ? { kind: "skip", reason: missing } : { kind: "ok", email, phone, site };
  }

  /** Candidat écarté hors du CRM : noté une fois pour toutes, jamais revérifié. */
  async function skip(siren: string, name: string, segment: string, reason: string) {
    if (siren) await db.insert(schema.feedSkipped).values({ siren, name: name.slice(0, 200), segment, reason: reason.slice(0, 300), skippedOn: t }).onConflictDoNothing();
    sum.rejected++;
  }

  /**
   * Recherche dans l'Annuaire, segment par segment. Chaque candidat nouveau est vérifié AVANT d'entrer dans le CRM :
   * avec une adresse publiée et un téléphone, il est créé avec son contact complet ; sinon il reste hors du CRM.
   * Une page de l'Annuaire n'est considérée comme lue que lorsque tous ses candidats ont été traités.
   */
  async function searchAndVerify() {
    const rows = await db.select({ name: schema.companies.name, siren: schema.companies.siren }).from(schema.companies);
    const sirens = new Set(rows.map((r) => r.siren).filter(Boolean));
    const names = new Set(rows.map((r) => r.name.trim().toLowerCase()));
    const skipped = new Set((await db.select({ siren: schema.feedSkipped.siren }).from(schema.feedSkipped)).map((r) => r.siren));
    const prixAuditCents = (await getProfile()).prixAuditCents;
    const effectifs = s.effectifs.split(",").filter((c) => EFFECTIF_CODES.includes(c));
    const departements = parseDepartements(s.departements);
    const cursors = readCursors(s.cursors);
    const perDay = Math.max(0, Math.min(s.importPerSegment, 200));
    let dup = 0, blocked = 0;

    const order = segmentOrder(SEGMENTS, opts.pass ?? 1);
    for (const [k, segment] of order.entries()) {
      // Cabinets réservés aux prescripteurs : cherchés seulement quand l'alimentation des prescripteurs est en marche.
      const plan = searchPlan(segment, departements, s.feedPrescripteur ? [] : reservedSectors());
      if (!plan.length) continue;
      const mine = await db.select({ stage: schema.feedItems.stage, importedOn: schema.feedItems.importedOn }).from(schema.feedItems).where(eq(schema.feedItems.segment, segment));
      const stock = mine.filter((i) => ACTIVE_STAGES.includes(i.stage)).length;
      // Deux limites : les entreprises intégrées du jour, et un stock en cours de traitement qui ne dépasse pas deux jours d'intégration.
      let quota = Math.min(perDay - mine.filter((i) => i.importedOn === t).length, 2 * perDay - stock);
      // Le quota Google du jour est partagé équitablement entre les segments qui restent à traiter.
      const placesCap = placesUsed + Math.ceil(Math.max(0, placesMax - placesUsed) / (order.length - k));
      let cur: Cursor = cursors[segment] && cursors[segment]!.combo < plan.length ? cursors[segment]! : { combo: 0, page: 1 };
      // Au plus 8 pages de l'Annuaire par segment et par passage : assez pour avancer, sans solliciter l'API à l'excès.
      for (let pages = 0; quota > 0 && pages < 8 && left() > 15_000; pages++) {
        const { sector, departement } = plan[cur.combo];
        const r = await deps.search({ offer: "audit", sector, departement, effectifs, query: "", page: cur.page });
        if (!r.ok) {
          notes.push(`Recherche interrompue : ${r.error}`);
          break;
        }
        sum.found += r.page.items.length;
        const fresh: typeof r.page.items = [];
        const seen = new Set<string>();
        for (const c of r.page.items) {
          if (c.blocked) { blocked++; continue; }
          if (c.inCrm || sirens.has(c.siren) || seen.has(c.siren) || names.has(c.name.trim().toLowerCase())) { dup++; continue; }
          if (skipped.has(c.siren) || segmentOfSector(c.sector) !== segment) continue;
          seen.add(c.siren);
          fresh.push(c);
        }
        let done = 0;
        let stop = false;
        while (done < fresh.length && !stop) {
          if (quota <= 0 || left() < 15_000) break;
          const batch = fresh.slice(done, done + Math.min(3, quota));
          const results = await Promise.all(batch.map((c) => verify(c.name, c.city, c.address, "", c.siren, placesCap)));
          for (const [i, c] of batch.entries()) {
            const v = results[i];
            if (v.kind === "wait") { stop = true; continue; }
            if (v.kind === "skip") {
              await skip(c.siren, c.name, segment, v.reason);
              skipped.add(c.siren);
            } else {
              const companyId = await insertProspect(c, { offer: "audit", prixAuditCents, phone: v.phone, website: v.site, email: v.email, event: `Entreprise importée par l'alimentation automatique : site ${hostOf(v.site)}, e-mail publié sur le site ${v.email}, téléphone ${v.phone}` });
              await db.insert(schema.feedItems).values({ companyId, segment, stage: firstStage, importedOn: t, movedOn: t });
              sirens.add(c.siren);
              names.add(c.name.trim().toLowerCase());
              sum.imported++;
              sum.completed++;
              quota--;
            }
          }
          // Un candidat en attente (quota ou panne de Google) n'est pas noté : la page sera relue au passage suivant.
          if (!stop) done += batch.length;
        }
        if (done < fresh.length) break; // page pas entièrement traitée : on la relira
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

  /**
   * Entreprises importées avant la règle stricte, encore « à compléter » : même vérification. Complètes, elles poursuivent ;
   * incomplètes, elles sont retirées du CRM si elles n'y ont laissé aucune trace (aucun échange, envoi, campagne, devis…),
   * sinon gardées et marquées écartées.
   */
  async function recheckLegacy() {
    const items = await db.select().from(schema.feedItems).where(eq(schema.feedItems.stage, "a_completer")).orderBy(asc(schema.feedItems.createdAt)).limit(60);
    let removed = 0;
    for (let k = 0; k < items.length && left() > 15_000 && !placesDown; k += 3) {
      const batch = items.slice(k, k + 3);
      const results = await Promise.all(
        batch.map(async (it) => {
          const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, it.companyId)).limit(1))[0];
          return c ? { it, c, v: await verify(c.name, c.city, c.address, siteFromNotes(c.notes), c.siren) } : { it, c: undefined, v: undefined };
        }),
      );
      let wait = false;
      for (const { it, c, v } of results) {
        if (!c || !v) { await reject(it.id, REJECT.gone); continue; }
        if (v.kind === "wait") { wait = true; await move(it.id, { reason: v.reason }); continue; }
        if (v.kind === "ok") {
          const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, c.id)).orderBy(desc(schema.contacts.isPrimary)).limit(1))[0];
          await saveContact(c, ct, v.email, v.phone, v.site);
          sum.completed++;
          await move(it.id, { stage: firstStage, reason: "", tries: 0 });
          continue;
        }
        if (await untouched(c.id)) {
          await db.transaction(async (tx) => {
            await tx.delete(schema.companies).where(eq(schema.companies.id, c.id));
            if (c.siren) await tx.insert(schema.feedSkipped).values({ siren: c.siren, name: c.name.slice(0, 200), segment: it.segment, reason: v.reason.slice(0, 300), skippedOn: t }).onConflictDoNothing();
          });
          sum.rejected++;
          removed++;
        } else {
          await reject(it.id, v.reason);
        }
      }
      if (wait) break;
    }
    if (removed) notes.push(`${removed} entreprise(s) incomplète(s) retirée(s) du CRM`);
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
  async function diagnoseReady(capMs = Infinity) {
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
    await runDiagnostics({ budgetMs: Math.max(1, Math.min(left() - 4_000, 25_000, capMs)), probe: deps.probe, batch: 6 });
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
    const services: ServiceKey[] = [...(s.feedDiagnostic ? (["diagnostic"] as const) : []), ...(s.feedAudit ? (["audit"] as const) : []), ...(s.feedPrescripteur ? (["prescripteur"] as const) : [])];
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
      const perProspect = k === "prescripteur" ? PRESCRIBER_MAILS : MAILS_PER_PROSPECT;
      slots[k] = enrolSlots(daily[k].limit, mine.reduce((n, a) => n + Math.max(0, perProspect - a.nextStep), 0), mine.filter((a) => a.nextStep === 0).length, perProspect);
    }
    const optouts = await optoutSet();
    const rest = restDays();
    const history: Partial<Record<ServiceKey, Map<string, CrossHistory>>> = { audit: await crossHistories("audit"), diagnostic: await crossHistories("diagnostic"), ...(s.feedPrescripteur ? { prescripteur: await crossHistories("prescripteur") } : {}) };
    const reserved = reservedSectors();
    const diagRows = await db.select().from(schema.companyDiagnostics).where(inArray(schema.companyDiagnostics.companyId, ready.map((r) => r.companyId))).orderBy(desc(schema.companyDiagnostics.createdAt));
    const campaigns = new Map<string, { id: string; status: string }>();

    type Verdict = { kind: "ok" } | { kind: "wait" | "reject"; reason: string } | { kind: "rediagnose" };
    for (const it of ready) {
      if (!isSegment(it.segment)) { await reject(it.id, "Segment inconnu"); continue; }
      const segment: Segment = it.segment;
      const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, it.companyId)).limit(1))[0];
      if (!c) { await reject(it.id, REJECT.gone); continue; }
      const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, c.id)).orderBy(desc(schema.contacts.isPrimary)).limit(1))[0];
      const cand = { id: c.id, name: c.name, stage: c.stage, email: ct?.email ?? "", emailSource: ct?.emailSource ?? "", sector: c.sector };

      const judge = (service: ServiceKey): Verdict => {
        const ex = entryExclusion(cand, optouts, inCampaign, service, history[service]?.get(c.id), t, rest, reserved);
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
          if ((!first || /^standard$/i.test(first)) && !greetsWithoutName(cand.email, cand.emailSource)) return { kind: "reject", reason: REJECT.noFirstName };
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
      const offer = service === "diagnostic" ? "diagnostic" : service === "prescripteur" ? "prescripteur" : "audit";
      const found = (await db.select({ id: schema.mailCampaigns.id, status: schema.mailCampaigns.status }).from(schema.mailCampaigns).where(and(eq(schema.mailCampaigns.auto, true), eq(schema.mailCampaigns.offer, offer), eq(schema.mailCampaigns.segment, segment), ne(schema.mailCampaigns.status, "terminee"))).orderBy(desc(schema.mailCampaigns.createdAt)).limit(1))[0];
      const camp = found ?? { id: (await db.insert(schema.mailCampaigns).values({ name: permanentName(service, segment), offer, segment, auto: true }).returning({ id: schema.mailCampaigns.id }))[0].id, status: "active" };
      campaigns.set(key, camp);
      return camp;
    }
  }
}

/**
 * Entreprise créée par l'alimentation et restée sans aucune trace : ni échange, ni envoi, ni campagne, ni diagnostic, ni pièce
 * commerciale ou de suivi. Seul cas où l'alimentation retire une entreprise du CRM.
 */
async function untouched(companyId: string): Promise<boolean> {
  const c = (await db.select({ source: schema.companies.source, stage: schema.companies.stage }).from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1))[0];
  if (!c || c.source !== "Recherche automatique" || c.stage !== "qualif") return false;
  const any = async (table: typeof schema.tasks | typeof schema.quotes | typeof schema.invoices | typeof schema.calls | typeof schema.meetings | typeof schema.mailSends | typeof schema.mailCampaignItems | typeof schema.companyDiagnostics | typeof schema.contracts | typeof schema.missions | typeof schema.tickets | typeof schema.securityActions | typeof schema.audits | typeof schema.incidents | typeof schema.documents) =>
    (await db.select({ n: sql<number>`count(*)` }).from(table).where(eq(table.companyId, companyId)))[0].n > 0;
  for (const table of [schema.tasks, schema.quotes, schema.invoices, schema.calls, schema.meetings, schema.mailSends, schema.mailCampaignItems, schema.companyDiagnostics, schema.contracts, schema.missions, schema.tickets, schema.securityActions, schema.audits, schema.incidents, schema.documents]) {
    if (await any(table)) return false;
  }
  if ((await db.select({ n: sql<number>`count(*)` }).from(schema.contacts).where(and(eq(schema.contacts.companyId, companyId), ne(schema.contacts.email, ""))))[0].n > 0) return false;
  // Seuls les événements écrits par l'alimentation elle-même sont admis.
  const evs = await db.select({ type: schema.events.type, text: schema.events.text }).from(schema.events).where(eq(schema.events.companyId, companyId));
  return evs.every((e) => /alimentation automatique/i.test(e.text));
}

/** Compteurs du jour et état du stock, pour la page Alimentation. */
export async function feedOverview(t = today()) {
  const s = await getFeedSettings();
  const stages = await db.select({ stage: schema.feedItems.stage, n: sql<number>`count(*)` }).from(schema.feedItems).groupBy(schema.feedItems.stage);
  const day = await db.select({ stage: schema.feedItems.stage, n: sql<number>`count(*)` }).from(schema.feedItems).where(eq(schema.feedItems.movedOn, t)).groupBy(schema.feedItems.stage);
  const importedToday = Number((await db.select({ n: sql<number>`count(*)` }).from(schema.feedItems).where(eq(schema.feedItems.importedOn, t)))[0]?.n ?? 0);
  const count = (rows: { stage: string; n: number }[], k: string) => Number(rows.find((r) => r.stage === k)?.n ?? 0);
  // Intégrations par segment : aujourd'hui et sur 7 jours (montre si chaque segment avance, l'immobilier compris).
  const since = addDays(t, -6);
  const bySeg = await db.select({ segment: schema.feedItems.segment, importedOn: schema.feedItems.importedOn }).from(schema.feedItems).where(sql`${schema.feedItems.importedOn} >= ${since}`);
  const segments = SEGMENTS.map((k) => ({ segment: k, today: bySeg.filter((r) => r.segment === k && r.importedOn === t).length, week: bySeg.filter((r) => r.segment === k).length }));
  const skippedAll = Number((await db.select({ n: sql<number>`count(*)` }).from(schema.feedSkipped))[0]?.n ?? 0);
  const skippedToday = Number((await db.select({ n: sql<number>`count(*)` }).from(schema.feedSkipped).where(eq(schema.feedSkipped.skippedOn, t)))[0]?.n ?? 0);
  return {
    settings: s,
    placesReady: placesReady(),
    placesUsedToday: s.placesDay === t ? s.placesUsed : 0,
    segments,
    today: { imported: importedToday, enrolled: count(day, "inscrit"), rejected: count(day, "ecarte") + skippedToday },
    stock: { toComplete: count(stages, "a_completer"), toDiagnose: count(stages, "a_diagnostiquer"), ready: count(stages, "a_inscrire"), enrolled: count(stages, "inscrit"), rejected: count(stages, "ecarte") + skippedAll },
  };
}
