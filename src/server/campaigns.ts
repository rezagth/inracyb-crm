import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { stageOf, stageRank } from "@/lib/constants";
import { EMAIL_RE } from "@/lib/brevo";
import { makeOptoutToken, nextDueAfterSend, pickDue, STEP_LABELS, withUnsubscribeFooter } from "@/lib/campaign";
import { today } from "@/lib/format";
import { OFFER_KIT, scripts, type OfferKey } from "@/lib/prospection";
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
export async function recordOptout(email: string, source: string): Promise<void> {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return;
  await db.insert(schema.mailOptouts).values({ email: e, source }).onConflictDoNothing();
  const cts = await db.select({ companyId: schema.contacts.companyId }).from(schema.contacts).where(sql`lower(${schema.contacts.email}) = ${e}`);
  for (const { companyId } of cts) {
    await db
      .update(schema.mailCampaignItems)
      .set({ status: "arrete", stopReason: "Désinscrit" })
      .where(and(eq(schema.mailCampaignItems.companyId, companyId), eq(schema.mailCampaignItems.status, "en_cours")));
    await logEvent(db, companyId, "note", `Désinscription demandée (${source}) : ${e}. Plus aucun mail de campagne.`);
  }
}

export async function optoutSet(): Promise<Set<string>> {
  return new Set((await db.select({ email: schema.mailOptouts.email }).from(schema.mailOptouts)).map((r) => r.email));
}

export type RunSummary = { ok: boolean; sent: number; stopped: number; errors: number; waiting: number; message: string };

/**
 * Envoie les mails de campagne arrivés à échéance, dans la limite du plafond du jour (MAIL_DAILY_LIMIT, tous envois confondus).
 * Avant chaque envoi : on revérifie l'entreprise (perdue ? avancée dans le pipeline ? désinscrite ? e-mail valide ?) et on ne renvoie jamais une étape déjà envoyée.
 */
export async function runCampaigns(opts: { campaignId?: string; budgetMs?: number } = {}): Promise<RunSummary> {
  const cfg = brevoConfig();
  const fail = (message: string): RunSummary => ({ ok: false, sent: 0, stopped: 0, errors: 0, waiting: 0, message });
  if (!cfg.apiKey) return fail("Brevo n'est pas configuré : ajoute BREVO_API_KEY (dans .env et dans Vercel).");
  if (!appUrl() || (process.env.AUTH_SECRET || "").trim().length < 16) return fail("Ajoute APP_URL (l'adresse https:// du CRM) dans les variables d'environnement : elle sert au lien de désinscription obligatoire dans chaque mail.");

  const t = today();
  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const sentToday = Number((await db.select({ n: sql<number>`count(*)` }).from(schema.mailSends).where(eq(schema.mailSends.sentOn, t)))[0]?.n ?? 0);
  let remaining = cfg.dailyLimit - sentToday;

  const rows = await db
    .select({ item: schema.mailCampaignItems, campaign: schema.mailCampaigns })
    .from(schema.mailCampaignItems)
    .innerJoin(schema.mailCampaigns, eq(schema.mailCampaigns.id, schema.mailCampaignItems.campaignId))
    .where(and(eq(schema.mailCampaignItems.status, "en_cours"), eq(schema.mailCampaigns.status, "active"), ...(opts.campaignId ? [eq(schema.mailCampaigns.id, opts.campaignId)] : [])))
    .orderBy(asc(schema.mailCampaignItems.nextDue));

  const dueAll = rows.filter((r) => r.item.nextDue <= t).length;
  if (remaining <= 0) return { ok: true, sent: 0, stopped: 0, errors: 0, waiting: dueAll, message: `Plafond du jour atteint (${cfg.dailyLimit} mails). ${dueAll} mail(s) en attente : ils partiront demain, ou monte MAIL_DAILY_LIMIT.` };

  const due = pickDue(rows.map((r) => ({ ...r, nextDue: r.item.nextDue })), t, remaining);
  const optouts = await optoutSet();
  const profile = await getProfile();
  let sent = 0, stopped = 0, errors = 0, consecutive = 0;
  const stop = async (itemId: string, reason: string) => {
    await db.update(schema.mailCampaignItems).set({ status: "arrete", stopReason: reason, lastError: "" }).where(eq(schema.mailCampaignItems.id, itemId));
    stopped++;
  };

  for (const { item, campaign } of due) {
    if (Date.now() - started > budget) break;
    if (remaining <= 0 || consecutive >= 3) break;
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
    const offer = campaign.offer as OfferKey;
    const step = item.nextStep;
    const already = (await db.select({ id: schema.mailSends.id }).from(schema.mailSends).where(and(eq(schema.mailSends.companyId, c.id), eq(schema.mailSends.offer, offer), eq(schema.mailSends.step, step))).limit(1))[0];
    const finishStep = async (sentOn: string, subject: string, viaBrevo: boolean) => {
      const nd = nextDueAfterSend(sentOn, step);
      await db.transaction(async (tx) => {
        if (viaBrevo) {
          await tx.insert(schema.mailSends).values({ companyId: c.id, offer, step, subject, sentOn });
          await logEvent(tx, c.id, "mail", `Mail ${STEP_LABELS[step]} envoyé par la campagne « ${campaign.name} » (${OFFER_KIT[offer].l}) : « ${subject} »`);
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

    const mail = scripts({ name: c.name, sector: c.sector, contact: [ct?.firstName, ct?.lastName].filter(Boolean).join(" "), role: ct?.role ?? "", email, phone: ct?.phone ?? "" }, offer, profile).mails[step];
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
      continue;
    }
    consecutive = 0;
    remaining--;
    sent++;
    try {
      await finishStep(t, mail.subject, true);
    } catch {
      try { await finishStep(t, mail.subject, true); } catch { console.error("campagne : mail parti mais enregistrement échoué", item.id); }
    }
  }

  const waiting = Math.max(0, dueAll - sent - stopped);
  const parts = [`${sent} mail(s) envoyé(s)`, stopped ? `${stopped} arrêté(s)` : "", errors ? `${errors} en erreur` : "", waiting ? `${waiting} en attente (plafond ou délai)` : ""].filter(Boolean);
  return { ok: true, sent, stopped, errors, waiting, message: parts.join(" · ") };
}
