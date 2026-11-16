import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { stageOf, stageRank } from "@/lib/constants";
import { EMAIL_RE } from "@/lib/brevo";
import {
  crossHistory,
  dailyState,
  DEFAULT_DAILY_LIMIT,
  makeOptoutToken,
  nextDueAfterSend,
  parseLimit,
  pickDueByService,
  REPLIED_REASON,
  REST_DAYS_DEFAULT,
  runFailed,
  SERVICE_LABEL,
  serviceOf,
  STEP_LABELS,
  withUnsubscribeFooter,
  type CampaignOffer,
  type CrossHistory,
  type DailyState,
  type ServiceKey,
} from "@/lib/campaign";
import { today } from "@/lib/format";
import { OFFER_KIT, scripts, type OfferKey, type Profile, type Prospect } from "@/lib/prospection";
import { brevoConfig, sendBrevoMail } from "./brevo";
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

export const offerLabel = (offer: string): string => OFFER_KIT[offer as OfferKey]?.l ?? (offer === "diagnostic" ? "Diagnostic gratuit" : offer);

export type CampaignMail = { subject: string; body: string };
/** Fabrique le mail d'une étape. Renvoie null quand aucun modèle n'existe pour cette offre : rien ne part. */
export type MailFor = (offer: CampaignOffer, prospect: Prospect, profile: Profile, step: number) => CampaignMail | null;
const defaultMailFor: MailFor = (offer, prospect, profile, step) => (offer === "audit" || offer === "ciso" || offer === "ia" ? (scripts(prospect, offer, profile).mails[step] ?? null) : null);

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
export async function runCampaigns(opts: { campaignId?: string; budgetMs?: number; mailFor?: MailFor } = {}): Promise<RunSummary> {
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

  const rows = await db
    .select({ item: schema.mailCampaignItems, campaign: schema.mailCampaigns })
    .from(schema.mailCampaignItems)
    .innerJoin(schema.mailCampaigns, eq(schema.mailCampaigns.id, schema.mailCampaignItems.campaignId))
    .where(and(eq(schema.mailCampaignItems.status, "en_cours"), eq(schema.mailCampaigns.status, "active"), ...(opts.campaignId ? [eq(schema.mailCampaigns.id, opts.campaignId)] : [])))
    .orderBy(asc(schema.mailCampaignItems.nextDue));

  const dueRows = rows.filter((r) => r.item.nextDue <= t);
  const dueAll = dueRows.length;
  const dueServices = [...new Set(dueRows.map((r) => serviceOf(r.campaign.offer)))];
  // Plus rien ne peut partir : le total est atteint, ou chaque service qui a des mails à envoyer est à son plafond.
  if (remainingTotal <= 0 || (dueServices.length ? dueServices.every((s) => remaining[s] <= 0) : remaining.audit <= 0)) {
    const onlyAudit = dueServices.every((s) => s === "audit");
    const caps = onlyAudit ? `${state.audit.limit} mails` : (["audit", "diagnostic"] as const).map((s) => `${SERVICE_LABEL[s]} ${state[s].sent}/${state[s].limit}`).join(", ");
    return { ok: true, sent: 0, stopped: 0, errors: 0, waiting: dueAll, message: `Plafond du jour atteint (${caps}). ${dueAll} mail(s) en attente : ils partiront demain${onlyAudit ? ", ou monte MAIL_DAILY_LIMIT" : ""}.` };
  }

  const due = pickDueByService(rows.map((r) => ({ ...r, nextDue: r.item.nextDue, service: serviceOf(r.campaign.offer) })), t, state);
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
    const offer = campaign.offer as CampaignOffer;
    const step = item.nextStep;
    const already = (await db.select({ id: schema.mailSends.id }).from(schema.mailSends).where(and(eq(schema.mailSends.companyId, c.id), eq(schema.mailSends.offer, offer), eq(schema.mailSends.step, step))).limit(1))[0];
    const finishStep = async (sentOn: string, subject: string, viaBrevo: boolean) => {
      const nd = nextDueAfterSend(sentOn, step);
      await db.transaction(async (tx) => {
        if (viaBrevo) {
          await tx.insert(schema.mailSends).values({ companyId: c.id, offer, step, subject, sentOn });
          await logEvent(tx, c.id, "mail", `Mail ${STEP_LABELS[step]} envoyé par la campagne « ${campaign.name} » (${offerLabel(offer)}) : « ${subject} »`);
          if (c.stage !== "perdu" && stageRank(c.stage) < stageRank("contacte")) await tx.update(schema.companies).set({ stage: "contacte" }).where(eq(schema.companies.id, c.id));
          await tx.update(schema.companies).set({ lastContact: sentOn }).where(eq(schema.companies.id, c.id));
        }
        await tx
          .update(schema.mailCampaignItems)
          .set(nd ? { nextStep: step + 1, nextDue: nd, lastError: "" } : { status: "termine", stopReason: "Séquence terminée", lastError: "" })
          .where(eq(schema.mailCampaignItems.id, item.id));
      });
    };
    if (already) { await finishStep(t, "", false); continue; }

    const mail = mailFor(offer, { name: c.name, sector: c.sector, contact: [ct?.firstName, ct?.lastName].filter(Boolean).join(" "), role: ct?.role ?? "", email, phone: ct?.phone ?? "" }, profile, step);
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
  const parts = [`${sent} mail(s) envoyé(s)`, stopped ? `${stopped} arrêté(s)` : "", errors ? `${errors} en erreur` : "", waiting ? `${waiting} en attente (plafond ou délai)` : "", firstError ? `Erreur : ${firstError}` : ""].filter(Boolean);
  return { ok: true, sent, stopped, errors, waiting, message: parts.join(" · ") };
}
