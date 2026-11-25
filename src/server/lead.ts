import "server-only";
import { and, eq, gte, like, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { diagnose, mailable, targetsOf, type CheckStatus, type Probe } from "@/lib/diagnostic";
import { HOOK_TEXT, hookVariantOf } from "@/lib/diagnostic-mails";
import { fd, today } from "@/lib/format";
import { LEAD_DAILY_CAP, LEAD_EMAIL_SOURCE, LEAD_EVENT, LEAD_KINDS, leadMail, type Lead } from "@/lib/lead";
import { scripts } from "@/lib/prospection";
import { brevoReady, sendBrevoMail } from "./brevo";
import { optoutLink, optoutSet, reportLinkFor } from "./campaigns";
import { withUnsubscribeFooter } from "@/lib/campaign";
import { logEvent } from "./core";
import { publicProbe } from "./diagnostic";
import { getProfile } from "./queries";

/** Ce que le site affiche au visiteur : seulement des mesures publiques sur le domaine de son adresse. Le lien de la synthèse part par mail. */
export type LeadResult = {
  ok: true;
  domain: string;
  /** constats certains d'abord, puis les autres points vérifiés */
  findings: { label: string; status: CheckStatus; certain: boolean; wording: string }[];
  mailed: boolean;
};

/**
 * Demande entrante validée : fiche (créée ou retrouvée par l'adresse), diagnostic immédiat du domaine de l'adresse,
 * appel du jour en tête de la file, mail de réponse avec la synthèse. Jamais de séquence de prospection froide.
 */
export async function receiveLead(lead: Lead, opts: { probe?: Probe; nowMs?: number } = {}): Promise<LeadResult | { ok: false; status: number; error: string }> {
  const t = today();
  const dayStart = new Date(`${t}T00:00:00`);
  const todayCount = (await db.select({ n: sql<number>`count(*)` }).from(schema.events).where(and(like(schema.events.text, `${LEAD_EVENT}%`), gte(schema.events.createdAt, dayStart))))[0]?.n ?? 0;
  if (Number(todayCount) >= LEAD_DAILY_CAP) return { ok: false, status: 429, error: "Trop de demandes aujourd'hui : réessayez demain ou prenez rendez-vous directement." };

  // Diagnostic du domaine de l'adresse (et du site du même domaine) : lectures publiques et passives.
  const target = targetsOf(lead.email, `https://${lead.domain}`);
  if (!target.mailDomain) return { ok: false, status: 422, error: "Ce domaine ne peut pas être testé : utilisez l'adresse de votre entreprise." };
  const d = await diagnose(target, opts.probe ?? publicProbe, t);
  const hook = hookVariantOf(d.checks);
  const mainFinding = hook
    ? HOOK_TEXT[hook].finding
        .replace(/\{domaine\}/g, HOOK_TEXT[hook].family === "A" ? d.mailDomain : d.webHost)
        .replace(/\{date_expiration\}/g, fd(d.checks.find((c) => c.variant === hook)?.data?.validTo?.slice(0, 10)))
        .replace(/`/g, "")
    : "";

  const label = LEAD_KINDS[lead.kind];
  const existing = (await db.select({ companyId: schema.contacts.companyId, id: schema.contacts.id }).from(schema.contacts).where(sql`lower(${schema.contacts.email}) = ${lead.email}`).limit(1))[0];
  const { companyId, diagnosticId } = await db.transaction(async (tx) => {
    let cid = existing?.companyId ?? null;
    if (cid) {
      await tx.update(schema.contacts).set({ ...(lead.phone ? { phone: lead.phone } : {}), emailSource: LEAD_EMAIL_SOURCE }).where(eq(schema.contacts.id, existing!.id));
    } else {
      cid = (await tx.insert(schema.companies).values({ name: lead.company, source: `Site web : ${label}`, priority: "haute", stage: "qualif", notes: `Site web : https://${lead.domain}` }).returning({ id: schema.companies.id }))[0].id;
      await tx.insert(schema.contacts).values({ companyId: cid, firstName: lead.firstName, lastName: "", role: "", email: lead.email, emailSource: LEAD_EMAIL_SOURCE, phone: lead.phone, isPrimary: true });
      await logEvent(tx, cid, "create", `Entreprise créée par une demande entrante (${label} sur infracyb.fr)`);
    }
    const did = (await tx.insert(schema.companyDiagnostics).values({ companyId: cid, status: "fait", mailDomain: d.mailDomain, webHost: d.webHost, findings: JSON.stringify(d.checks), mainFinding: d.main, certainCount: d.certainCount, rulesVersion: d.rulesVersion, checkedOn: d.checkedOn }).returning({ id: schema.companyDiagnostics.id }))[0].id;
    await logEvent(tx, cid, "note", `${LEAD_EVENT} (${label}) : ${lead.firstName}, ${lead.email}${lead.phone ? `, ${lead.phone}` : ""}, accord pour être recontacté. ${mainFinding ? `Constat : ${mainFinding}.` : "Aucun constat certain."}${lead.summary ? `\n\n${lead.summary}` : ""}`);
    // Un seul appel ouvert à la fois : la demande entrante passe devant tout le reste de la file.
    const open = (await tx.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.companyId, cid), eq(schema.tasks.kind, "appel"), eq(schema.tasks.done, false))).limit(1))[0];
    const title = `Appeler ${lead.company}${lead.phone ? ` au ${lead.phone}` : ""} : demande entrante (${label})`.slice(0, 300);
    if (open) await tx.update(schema.tasks).set({ title, dueDate: t, priority: "haute" }).where(eq(schema.tasks.id, open.id));
    else await tx.insert(schema.tasks).values({ title, companyId: cid, dueDate: t, priority: "haute", kind: "appel" });
    return { companyId: cid, diagnosticId: did };
  });

  // Réponse par mail avec le lien de la synthèse (demandée par le visiteur), sauf adresse désinscrite.
  let mailed = false;
  if (brevoReady() && !(await optoutSet()).has(lead.email)) {
    const profile = await getProfile();
    const signature = scripts({ name: lead.company, sector: "Autres", contact: lead.firstName, role: "", email: lead.email, phone: lead.phone }, "audit", profile).x.sig;
    const mail = leadMail({ prenom: lead.firstName, domaine: lead.domain, lienRapport: reportLinkFor(diagnosticId, opts.nowMs) ?? "", mainFinding, lienCal: profile.calUrl, signature });
    if (mail) {
      const link = optoutLink(lead.email);
      const r = await sendBrevoMail({
        to: { email: lead.email, name: lead.firstName },
        subject: mail.subject,
        text: link ? withUnsubscribeFooter(mail.text, link) : mail.text,
        tags: ["crm", "entrant"],
        ...(link ? { headers: { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
      });
      mailed = r.ok;
      await logEvent(db, companyId, "mail", r.ok ? `Mail de réponse envoyé : « ${mail.subject} »` : `Mail de réponse non envoyé : ${r.error}`);
    }
  }

  const findings = [...d.checks.filter(mailable), ...d.checks.filter((c) => !mailable(c))].slice(0, 14).map((c) => ({ label: c.label, status: c.status, certain: mailable(c), wording: c.wording }));
  return { ok: true, domain: lead.domain, findings, mailed };
}

/** Demandes entrantes reçues depuis une date (rapport du lundi). */
export async function leadsSince(since: Date): Promise<number> {
  return Number((await db.select({ n: sql<number>`count(*)` }).from(schema.events).where(and(like(schema.events.text, `${LEAD_EVENT}%`), gte(schema.events.createdAt, since))))[0]?.n ?? 0);
}
