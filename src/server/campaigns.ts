import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { stageOf, stageRank } from "@/lib/constants";
import { EMAIL_RE } from "@/lib/brevo";
import { greetsWithoutName } from "@/lib/contact-extract";
import {
  crossHistory,
  dailyState,
  DEFAULT_DAILY_LIMIT,
  makeOptoutToken,
  nextDueAfterSend,
  originBlock,
  PAUSE_RULE,
  pauseReason,
  parseLimit,
  pickDue,
  REPLIED_REASON,
  REST_DAYS_DEFAULT,
  runFailed,
  SERVICE_KEYS,
  SERVICE_LABEL,
  serviceOf,
  STEP_LABELS,
  withUnsubscribeFooter,
  type CampaignOffer,
  type CrossHistory,
  type DailyState,
  type ServiceHealth,
  type ServiceKey,
} from "@/lib/campaign";
import { siteFromNotes } from "@/lib/contact-extract";
import { diagnose, parseChecks, targetsOf, type Check, type Probe } from "@/lib/diagnostic";
import { buildCallTask } from "@/lib/call-task";
import { buildDiagnosticMail, HOOK_TEXT, hookVariantOf, isHookVariant, isSegment, type Segment } from "@/lib/diagnostic-mails";
import { today } from "@/lib/format";
import { OFFER_KIT, scripts, type OfferKey, type Profile, type Prospect } from "@/lib/prospection";
import { brevoConfig, sendBrevoMail } from "./brevo";
import { publicProbe } from "./diagnostic";
import { logEvent } from "./core";
import { getProfile } from "./queries";

/** Adresse publique du CRM (pour le lien de désinscription) : APP_URL, sinon le domaine de production Vercel. */
export function appUrl(): string {
  const a = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (/^https:\/\//i.test(a)) return a;
  const v = (process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim();
  return v ? "https://" + v.replace(/^https?:\/\//i, "").replace(/\/+$/, "") : "";
}

export function optoutLink(email: string): string | null {
  const base = appUrl();
  const secret = (process.env.AUTH_SECRET || "").trim();
  if (!base || secret.length < 16) return null;
  return `${base}/api/desabonnement/${makeOptoutToken(secret, email)}`;
}

/** Enregistre une désinscription et arrête tout envoi en cours vers cette adresse. */
export async function recordOptout(email: string, source: string, reason = "Désinscrit"): Promise<void> {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return;
  await db.insert(schema.mailOptouts).values({ email: e, source }).onConflictDoNothing();
  const cts = await db.select({ companyId: schema.contacts.companyId }).from(schema.contacts).where(sql`lower(${schema.contacts.email}) = ${e}`);
  for (const { companyId } of cts) {
    await db
      .update(schema.mailCampaignItems)
      .set({ status: "arrete", stopReason: reason })
      .where(and(eq(schema.mailCampaignItems.companyId, companyId), eq(schema.mailCampaignItems.status, "en_cours")));
    await logEvent(db, companyId, "note", reason === "Désinscrit" ? `Désinscription demandée (${source}) : ${e}. Plus aucun mail de campagne.` : `Adresse écartée (${reason}) : ${e}. Plus aucun mail de campagne.`);
  }
}

export async function optoutSet(): Promise<Set<string>> {
  return new Set((await db.select({ email: schema.mailOptouts.email }).from(schema.mailOptouts)).map((r) => r.email));
}

/** Délai de repos (jours) avant de passer d'un service à l'autre : 30 par défaut, CAMPAIGN_REST_DAYS (facultative) le remplace. */
export function restDays(): number {
  return parseLimit(process.env.CAMPAIGN_REST_DAYS, REST_DAYS_DEFAULT, 365);
}

/**
 * Plafonds et envois du jour, par service. Les plafonds sont dans le code (audit 10, diagnostic 10 par paliers) ;
 * MAIL_DAILY_LIMIT (audit) et MAIL_DAILY_LIMIT_DIAGNOSTIC (facultative) peuvent les remplacer.
 */
export async function getDailyState(t = today()): Promise<DailyState> {
  const rows = await db.select({ offer: schema.mailSends.offer, n: sql<number>`count(*)` }).from(schema.mailSends).where(eq(schema.mailSends.sentOn, t)).groupBy(schema.mailSends.offer);
  const first = (await db.select({ d: sql<string | null>`min(${schema.mailSends.sentOn})` }).from(schema.mailSends).where(eq(schema.mailSends.offer, "diagnostic")))[0]?.d ?? null;
  return dailyState({
    today: t,
    sentByOffer: Object.fromEntries(rows.map((r) => [r.offer, Number(r.n)])),
    firstDiagnosticSendOn: first,
    auditLimit: brevoConfig().dailyLimit,
    diagnosticTarget: parseLimit(process.env.MAIL_DAILY_LIMIT_DIAGNOSTIC, DEFAULT_DAILY_LIMIT.diagnostic),
  });
}

/** Historique de chaque entreprise vu depuis le service visé (derniers envois de l'autre service, réponses). Les entreprises sans aucun envoi n'y figurent pas. */
export async function crossHistories(target: ServiceKey): Promise<Map<string, CrossHistory>> {
  const sends = await db.select({ companyId: schema.mailSends.companyId, offer: schema.mailSends.offer, sentOn: schema.mailSends.sentOn }).from(schema.mailSends);
  const replied = await db
    .select({ companyId: schema.mailCampaignItems.companyId, offer: schema.mailCampaigns.offer })
    .from(schema.mailCampaignItems)
    .innerJoin(schema.mailCampaigns, eq(schema.mailCampaigns.id, schema.mailCampaignItems.campaignId))
    .where(eq(schema.mailCampaignItems.stopReason, REPLIED_REASON));
  const ids = new Set<string>([...sends.map((s) => s.companyId), ...replied.map((r) => r.companyId)].filter((x): x is string => !!x));
  const out = new Map<string, CrossHistory>();
  for (const id of ids) out.set(id, crossHistory(target, sends.filter((s) => s.companyId === id), replied.filter((r) => r.companyId === id).map((r) => r.offer)));
  return out;
}

const BOUNCE_KINDS = ["rebond", "bloque", "invalide"];
export type ServiceStatus = { paused: boolean; reason: string; changedAt: Date | null; health: ServiceHealth };

/**
 * Santé de chaque service sur la fenêtre de la règle de pause (30 jours, ou depuis la dernière reprise) :
 * envois, rebonds et plaintes. Met le service en pause, avec une tâche prioritaire, dès que la règle est franchie.
 * Une pause ne se lève jamais toute seule : c'est toi qui reprends, depuis la page Campagnes.
 */
export async function checkServicePauses(): Promise<Record<ServiceKey, ServiceStatus>> {
  const states = await db.select().from(schema.mailServiceState);
  const windowStart = new Date(Date.now() - PAUSE_RULE.windowDays * 86_400_000);
  const out = {} as Record<ServiceKey, ServiceStatus>;
  for (const service of SERVICE_KEYS) {
    const st = states.find((s) => s.service === service);
    // Après une reprise, on ne recompte que ce qui est arrivé depuis.
    const since = st && !st.paused && st.changedAt > windowStart ? st.changedAt : windowStart;
    const sends = await db.select({ offer: schema.mailSends.offer, n: sql<number>`count(*)` }).from(schema.mailSends).where(gte(schema.mailSends.createdAt, since)).groupBy(schema.mailSends.offer);
    const events = await db.select({ type: schema.mailEvents.type, n: sql<number>`count(*)` }).from(schema.mailEvents).where(and(eq(schema.mailEvents.service, service), gte(schema.mailEvents.createdAt, since))).groupBy(schema.mailEvents.type);
    const count = (kinds: string[]) => events.filter((e) => kinds.includes(e.type)).reduce((a, e) => a + Number(e.n), 0);
    const health: ServiceHealth = { sent: sends.filter((s) => serviceOf(s.offer) === service).reduce((a, s) => a + Number(s.n), 0), bounces: count(BOUNCE_KINDS), complaints: count(["spam"]) };
    if (st?.paused) { out[service] = { paused: true, reason: st.reason, changedAt: st.changedAt, health }; continue; }
    const reason = pauseReason(health);
    if (!reason) { out[service] = { paused: false, reason: "", changedAt: st?.changedAt ?? null, health }; continue; }
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(schema.mailServiceState).values({ service, paused: true, reason, changedAt: now }).onConflictDoUpdate({ target: schema.mailServiceState.service, set: { paused: true, reason, changedAt: now } });
      await tx.insert(schema.tasks).values({ title: `Service ${SERVICE_LABEL[service]} en pause : ${reason}`.slice(0, 200), dueDate: today(), priority: "haute" });
      await logEvent(tx, null, "mail", `Envois du service ${SERVICE_LABEL[service]} mis en pause automatiquement : ${reason}.`);
    });
    out[service] = { paused: true, reason, changedAt: now, health };
  }
  return out;
}

/** Reprise manuelle d'un service : le calcul de santé repart de cet instant. */
export async function resumeService(service: ServiceKey): Promise<void> {
  const now = new Date();
  await db.insert(schema.mailServiceState).values({ service, paused: false, reason: "", changedAt: now }).onConflictDoUpdate({ target: schema.mailServiceState.service, set: { paused: false, reason: "", changedAt: now } });
  await logEvent(db, null, "mail", `Envois du service ${SERVICE_LABEL[service]} repris manuellement.`);
}

/**
 * Service auquel rattacher un événement Brevo sans tag exploitable : celui du dernier mail envoyé à cette adresse.
 */
export async function serviceOfLastSend(email: string): Promise<ServiceKey | null> {
  const cts = await db.select({ companyId: schema.contacts.companyId }).from(schema.contacts).where(sql`lower(${schema.contacts.email}) = ${email}`);
  if (!cts.length) return null;
  const last = (await db.select({ offer: schema.mailSends.offer }).from(schema.mailSends).where(inArray(schema.mailSends.companyId, cts.map((c) => c.companyId))).orderBy(desc(schema.mailSends.createdAt)).limit(1))[0];
  return last ? serviceOf(last.offer) : null;
}

export const offerLabel = (offer: string): string => OFFER_KIT[offer as OfferKey]?.l ?? (offer === "diagnostic" ? "Diagnostic gratuit" : offer);

export type CampaignMail = { subject: string; body: string };
/** Fabrique le mail d'une étape. Renvoie null quand aucun modèle n'existe pour cette offre : rien ne part. */
export type MailFor = (offer: CampaignOffer, prospect: Prospect, profile: Profile, step: number) => CampaignMail | null;
const defaultMailFor: MailFor = (offer, prospect, profile, step) => (offer === "audit" || offer === "ciso" || offer === "ia" ? (scripts(prospect, offer, profile).mails[step] ?? null) : null);

type DiagnosticPrep = { mail: CampaignMail; hook: string } | { stop: string } | { error: string };

/**
 * Mail d'une étape de la séquence Diagnostic.
 * J0 et J+3 citent une mesure : le domaine est remesuré juste avant l'envoi. Constat disparu : la séquence s'arrête
 * (on n'écrit jamais une affirmation devenue fausse). Mesure impossible aujourd'hui : rien ne part, nouvel essai au passage suivant.
 * J+7 et J+14 ne citent aucune mesure : ils reprennent le domaine et le constat du premier mail.
 */
async function prepareDiagnosticMail(a: { companyId: string; companyName: string; notes: string; email: string; emailSource: string; firstName: string; segment: string; step: number; hook: string; profile: Profile; signature: string; today: string; probe: Probe }): Promise<DiagnosticPrep> {
  if (!isSegment(a.segment)) return { error: "Campagne sans segment : impossible de choisir le texte du mail." };
  const segment: Segment = a.segment;
  let checks: Check[] = [];
  let mailDomain = "";
  let webHost = "";
  let hook = a.hook;
  if (a.step <= 1) {
    const prev = (await db.select().from(schema.companyDiagnostics).where(and(eq(schema.companyDiagnostics.companyId, a.companyId), eq(schema.companyDiagnostics.status, "fait"))).orderBy(desc(schema.companyDiagnostics.createdAt)).limit(1))[0];
    const d = await diagnose(targetsOf(a.email, siteFromNotes(a.notes)), a.probe, a.today);
    await db.insert(schema.companyDiagnostics).values({ companyId: a.companyId, status: "fait", mailDomain: d.mailDomain, webHost: d.webHost, findings: JSON.stringify(d.checks), mainFinding: d.main, certainCount: d.certainCount, rulesVersion: d.rulesVersion, checkedOn: d.checkedOn });
    checks = d.checks;
    mailDomain = d.mailDomain;
    webHost = d.webHost;
    // Le contrôle qui portait le constat a-t-il pu être mesuré aujourd'hui ?
    const unmeasured = (id: string) => !id || d.checks.find((c) => c.id === id)?.status === "erreur" || !d.checks.some((c) => c.id === id);
    if (a.step === 0) {
      const now = hookVariantOf(d.checks);
      if (!now) return unmeasured(prev?.mainFinding ?? "") ? { error: "Constat non revérifiable aujourd'hui (mesure impossible) : nouvel essai au prochain envoi." } : { stop: "Plus de constat à la date d'envoi" };
      hook = now;
    } else {
      if (!isHookVariant(hook)) return { error: "Constat du premier mail introuvable : rien n'a été envoyé." };
      if (!d.checks.some((c) => c.variant === hook && c.status === "constat" && c.certain)) {
        const id = hook.split("-")[0];
        return unmeasured(id) ? { error: "Constat non revérifiable aujourd'hui (mesure impossible) : nouvel essai au prochain envoi." } : { stop: "Constat corrigé ou modifié depuis le premier mail" };
      }
    }
  } else {
    const last = (await db.select().from(schema.companyDiagnostics).where(and(eq(schema.companyDiagnostics.companyId, a.companyId), eq(schema.companyDiagnostics.status, "fait"))).orderBy(desc(schema.companyDiagnostics.createdAt)).limit(1))[0];
    mailDomain = last?.mailDomain ?? "";
    webHost = last?.webHost ?? "";
    checks = parseChecks(last?.findings ?? "[]").filter((c) => c.variant === hook);
  }
  if (!isHookVariant(hook)) return { error: "Constat du premier mail introuvable : rien n'a été envoyé." };
  const m = buildDiagnosticMail({ segment, step: a.step, hook, checks, mailDomain, webHost, prenom: a.firstName, sansPrenom: greetsWithoutName(a.email, a.emailSource), entreprise: a.companyName, me: a.profile.me, signature: a.signature });
  return m.ok ? { mail: { subject: m.subject, body: m.body }, hook } : { error: m.error };
}

export type RunSummary = { ok: boolean; sent: number; stopped: number; errors: number; waiting: number; message: string };

export { runFailed };

/** Garde une trace du déclenchement (visible sur la page Campagnes). Ne fait jamais échouer l'envoi si le journal est indisponible. */
export async function recordRun(source: "cron" | "manuel", r: RunSummary): Promise<void> {
  try {
    await db.insert(schema.mailRuns).values({ source, ok: !runFailed(r), sent: r.sent, stopped: r.stopped, errors: r.errors, waiting: r.waiting, message: r.message.slice(0, 500) });
  } catch (e) {
    console.error("campagne : journal du déclenchement non enregistré", e);
  }
}

/**
 * Envoie les mails de campagne arrivés à échéance, dans la limite du plafond du jour de chaque service (audit, diagnostic) et du total.
 * Avant chaque envoi : on revérifie l'entreprise (perdue ? avancée dans le pipeline ? désinscrite ? e-mail valide ?) et on ne renvoie jamais une étape déjà envoyée.
 */
export async function runCampaigns(opts: { campaignId?: string; budgetMs?: number; mailFor?: MailFor; probe?: Probe } = {}): Promise<RunSummary> {
  const cfg = brevoConfig();
  const fail = (message: string): RunSummary => ({ ok: false, sent: 0, stopped: 0, errors: 0, waiting: 0, message });
  if (!cfg.apiKey) return fail("Brevo n'est pas configuré : ajoute BREVO_API_KEY (dans .env et dans Vercel).");
  if (!appUrl() || (process.env.AUTH_SECRET || "").trim().length < 16) return fail("Ajoute APP_URL (l'adresse https:// du CRM) dans les variables d'environnement : elle sert au lien de désinscription obligatoire dans chaque mail.");

  const t = today();
  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const state = await getDailyState(t);
  const remaining: Record<ServiceKey, number> = { audit: state.audit.remaining, diagnostic: state.diagnostic.remaining };
  let remainingTotal = state.total.remaining;
  const mailFor = opts.mailFor ?? defaultMailFor;

  // Un service en pause (rebonds, plainte) n'envoie plus rien tant que tu ne l'as pas repris.
  const status = await checkServicePauses();
  const pausedNote = SERVICE_KEYS.filter((s) => status[s].paused).map((s) => `Service ${SERVICE_LABEL[s]} en pause (${status[s].reason})`).join(" · ");

  const allRows = await db
    .select({ item: schema.mailCampaignItems, campaign: schema.mailCampaigns })
    .from(schema.mailCampaignItems)
    .innerJoin(schema.mailCampaigns, eq(schema.mailCampaigns.id, schema.mailCampaignItems.campaignId))
    .where(and(eq(schema.mailCampaignItems.status, "en_cours"), eq(schema.mailCampaigns.status, "active"), ...(opts.campaignId ? [eq(schema.mailCampaigns.id, opts.campaignId)] : [])))
    .orderBy(asc(schema.mailCampaignItems.nextDue));
  const rows = allRows.filter((r) => !status[serviceOf(r.campaign.offer)].paused);
  const held = allRows.filter((r) => r.item.nextDue <= t).length - rows.filter((r) => r.item.nextDue <= t).length;

  const dueRows = rows.filter((r) => r.item.nextDue <= t);
  const dueAll = dueRows.length;
  const dueServices = [...new Set(dueRows.map((r) => serviceOf(r.campaign.offer)))];
  // Plus rien ne peut partir : le total est atteint, ou chaque service qui a des mails à envoyer est à son plafond.
  if (remainingTotal <= 0 || (dueServices.length ? dueServices.every((s) => remaining[s] <= 0) : remaining.audit <= 0)) {
    const onlyAudit = dueServices.every((s) => s === "audit");
    const caps = onlyAudit ? `${state.audit.limit} mails` : (["audit", "diagnostic"] as const).map((s) => `${SERVICE_LABEL[s]} ${state[s].sent}/${state[s].limit}`).join(", ");
    return { ok: true, sent: 0, stopped: 0, errors: 0, waiting: dueAll, message: `Plafond du jour atteint (${caps}). ${dueAll} mail(s) en attente : ils partiront demain${onlyAudit ? ", ou monte MAIL_DAILY_LIMIT" : ""}.${pausedNote ? ` ${pausedNote}.` : ""}` };
  }

  // Tous les mails dus, les plus en retard d'abord. Les plafonds sont appliqués dans la boucle, à chaque envoi réel :
  // une entrée bloquée (adresse à corriger, diagnostic à refaire) ne consomme donc jamais une place du jour.
  const due = pickDue(dueRows.map((r) => ({ ...r, nextDue: r.item.nextDue, service: serviceOf(r.campaign.offer) })), t, dueRows.length);
  const optouts = await optoutSet();
  const profile = await getProfile();
  let sent = 0, stopped = 0, errors = 0, consecutive = 0;
  let firstError = "";
  const stop = async (itemId: string, reason: string) => {
    await db.update(schema.mailCampaignItems).set({ status: "arrete", stopReason: reason, lastError: "" }).where(eq(schema.mailCampaignItems.id, itemId));
    stopped++;
  };

  for (const { item, campaign, service } of due) {
    if (Date.now() - started > budget) break;
    if (remainingTotal <= 0 || consecutive >= 3) break;
    if (remaining[service] <= 0) continue;
    const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, item.companyId)).limit(1))[0];
    if (!c) { await stop(item.id, "Entreprise supprimée"); continue; }
    if (c.stage === "perdu") { await stop(item.id, "Entreprise classée Perdu"); continue; }
    if (stageRank(c.stage) > stageRank("contacte")) { await stop(item.id, `Avancée dans le pipeline (${stageOf(c.stage).label})`); continue; }
    const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, c.id)).orderBy(desc(schema.contacts.isPrimary)).limit(1))[0];
    const email = (ct?.email ?? "").trim().toLowerCase();
    if (optouts.has(email)) { await stop(item.id, "Désinscrit"); continue; }
    if (!EMAIL_RE.test(email)) {
      await db.update(schema.mailCampaignItems).set({ lastError: "E-mail manquant ou invalide : complète la fiche." }).where(eq(schema.mailCampaignItems.id, item.id));
      errors++;
      continue;
    }
    const blocked = originBlock(ct?.emailSource ?? "", service);
    if (blocked) {
      await db.update(schema.mailCampaignItems).set({ lastError: blocked }).where(eq(schema.mailCampaignItems.id, item.id));
      errors++;
      continue;
    }
    const offer = campaign.offer as CampaignOffer;
    const step = item.nextStep;
    const already = (await db.select({ id: schema.mailSends.id }).from(schema.mailSends).where(and(eq(schema.mailSends.companyId, c.id), eq(schema.mailSends.offer, offer), eq(schema.mailSends.step, step))).limit(1))[0];
    let hook = "";
    const finishStep = async (sentOn: string, subject: string, viaBrevo: boolean) => {
      const nd = nextDueAfterSend(sentOn, step);
      await db.transaction(async (tx) => {
        if (viaBrevo) {
          await tx.insert(schema.mailSends).values({ companyId: c.id, offer, step, subject, sentOn });
          await logEvent(tx, c.id, "mail", `Mail ${STEP_LABELS[step]} envoyé par la campagne « ${campaign.name} » (${offerLabel(offer)}) : « ${subject} »`);
          if (c.stage !== "perdu" && stageRank(c.stage) < stageRank("contacte")) await tx.update(schema.companies).set({ stage: "contacte" }).where(eq(schema.companies.id, c.id));
          await tx.update(schema.companies).set({ lastContact: sentOn }).where(eq(schema.companies.id, c.id));
          // Diagnostic : le mail J+3 est parti, le CRM prépare l'appel du lendemain (J+4) avec le constat et les phrases d'ouverture.
          if (service === "diagnostic" && step === 1) {
            const h = item.hook || hook;
            const target = targetsOf(email, siteFromNotes(c.notes));
            const call = buildCallTask({
              company: c.name,
              contactName: /^standard$/i.test(ct?.firstName ?? "") ? "" : [ct?.firstName, ct?.lastName].filter(Boolean).join(" "),
              phone: ct?.phone ?? "",
              hook: h,
              domain: isHookVariant(h) && HOOK_TEXT[h].family === "B" ? target.webHost : target.mailDomain,
              me: profile.me,
              sentOn,
            });
            if (call && !(await tx.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.title, call.title), eq(schema.tasks.done, false))).limit(1))[0]) {
              await tx.insert(schema.tasks).values({ title: call.title, companyId: c.id, dueDate: call.dueDate, priority: call.priority });
              await logEvent(tx, c.id, "note", `Appel prévu le ${call.dueDate.split("-").reverse().join("/")} : phrases d'ouverture\n\n${call.opening}`);
            }
          }
        }
        await tx
          .update(schema.mailCampaignItems)
          .set({ ...(nd ? { nextStep: step + 1, nextDue: nd, lastError: "" } : { status: "termine", stopReason: "Séquence terminée", lastError: "" }), ...(hook && step === 0 ? { hook } : {}) })
          .where(eq(schema.mailCampaignItems.id, item.id));
      });
    };
    if (already) { await finishStep(t, "", false); continue; }

    const prospect: Prospect = { name: c.name, sector: c.sector, contact: [ct?.firstName, ct?.lastName].filter(Boolean).join(" "), role: ct?.role ?? "", email, phone: ct?.phone ?? "" };
    let mail: CampaignMail | null;
    if (service === "diagnostic") {
      const prep = await prepareDiagnosticMail({ companyId: c.id, companyName: c.name, notes: c.notes, email, emailSource: ct?.emailSource ?? "", firstName: ct?.firstName ?? "", segment: campaign.segment, step, hook: item.hook, profile, signature: scripts(prospect, "audit", profile).x.sig, today: t, probe: opts.probe ?? publicProbe });
      if ("stop" in prep) { await stop(item.id, prep.stop); continue; }
      if ("error" in prep) {
        await db.update(schema.mailCampaignItems).set({ lastError: prep.error.slice(0, 300) }).where(eq(schema.mailCampaignItems.id, item.id));
        errors++;
        continue;
      }
      mail = prep.mail;
      hook = prep.hook;
    } else mail = mailFor(offer, prospect, profile, step);
    if (!mail) {
      await db.update(schema.mailCampaignItems).set({ lastError: `Aucun modèle de mail pour « ${offerLabel(offer)} » : rien n'a été envoyé.` }).where(eq(schema.mailCampaignItems.id, item.id));
      errors++;
      continue;
    }
    const link = optoutLink(email)!;
    const res = await sendBrevoMail({
      to: { email, name: [ct?.firstName, ct?.lastName].filter(Boolean).join(" ") || undefined },
      subject: mail.subject,
      text: withUnsubscribeFooter(mail.body, link),
      tags: ["crm", "campagne", offer, STEP_LABELS[step]],
      headers: { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    if (!res.ok) {
      await db.update(schema.mailCampaignItems).set({ lastError: res.error.slice(0, 300) }).where(eq(schema.mailCampaignItems.id, item.id));
      errors++;
      consecutive++;
      if (!firstError) firstError = res.error;
      continue;
    }
    consecutive = 0;
    remaining[service]--;
    remainingTotal--;
    sent++;
    try {
      await finishStep(t, mail.subject, true);
    } catch {
      try { await finishStep(t, mail.subject, true); } catch { console.error("campagne : mail parti mais enregistrement échoué", item.id); }
    }
  }

  const waiting = Math.max(0, dueAll - sent - stopped);
  const parts = [`${sent} mail(s) envoyé(s)`, stopped ? `${stopped} arrêté(s)` : "", errors ? `${errors} en erreur` : "", waiting ? `${waiting} en attente (plafond ou délai)` : "", firstError ? `Erreur : ${firstError}` : "", pausedNote ? `${pausedNote}${held ? ` : ${held} mail(s) retenu(s)` : ""}` : ""].filter(Boolean);
  return { ok: true, sent, stopped, errors, waiting, message: parts.join(" · ") };
}
