import "server-only";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { db, schema } from "@/db";
import { EMAIL_RE } from "@/lib/brevo";
import { siteFromNotes } from "@/lib/contact-extract";
import { diagnose, parseChecks, targetsOf, type Probe } from "@/lib/diagnostic";
import { today } from "@/lib/format";
import { BILAN_EVENT, bilanDue, compareChecks, composeBilan } from "@/lib/monthly-check";
import { MONITORED_OFFERS } from "@/lib/pack-quote";
import { billingSender, brevoConfig, brevoReady, sendBrevoMail } from "./brevo";
import { getSettings, logEvent } from "./core";
import { publicProbe } from "./diagnostic";
import { getProfile } from "./queries";

export type MonthlyRun = { ok: boolean; sent: number; alerts: number; manual: number; message: string };

/**
 * Bilans mensuels des contrats de suivi (« Suivi Courrier & Domaine », « Suivi Sécurité PME ») : nouvelle mesure du domaine, comparaison avec la précédente,
 * mail au contact principal (étiquettes « facturation » et « suivi » : c'est un client, jamais compté contre la prospection),
 * tâche prioritaire si un écart apparaît. Au plus `max` contrats par passage (le reste part au jour ouvré suivant).
 */
export async function runMonthlyChecks(opts: { probe?: Probe; max?: number } = {}): Promise<MonthlyRun> {
  const t = today();
  const contracts = await db.select().from(schema.contracts).where(and(inArray(schema.contracts.offer, MONITORED_OFFERS), eq(schema.contracts.status, "actif")));
  let sent = 0, alerts = 0, manual = 0, done = 0;
  const p = await getProfile();
  const s = await getSettings();
  const signature = [p.me, p.company, p.phone].map((x) => (x ?? "").trim()).filter(Boolean).join("\n");
  for (const k of contracts) {
    if (done >= (opts.max ?? 5)) break;
    const last = (await db.select({ text: schema.events.text, at: schema.events.createdAt }).from(schema.events).where(and(eq(schema.events.companyId, k.companyId), like(schema.events.text, `${BILAN_EVENT}%`))).orderBy(desc(schema.events.createdAt)).limit(1))[0];
    const lastMonth = last ? new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(last.at).slice(0, 7) : "";
    if (!bilanDue(k, lastMonth, t)) continue;
    done++;
    const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, k.companyId)).limit(1))[0];
    if (!c) continue;
    const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, c.id)).orderBy(desc(schema.contacts.isPrimary)).limit(1))[0];
    const prev = (await db.select().from(schema.companyDiagnostics).where(and(eq(schema.companyDiagnostics.companyId, c.id), eq(schema.companyDiagnostics.status, "fait"))).orderBy(desc(schema.companyDiagnostics.createdAt)).limit(1))[0];
    const fresh = targetsOf(ct?.email ?? "", siteFromNotes(c.notes));
    const target = { mailDomain: prev?.mailDomain || fresh.mailDomain, webHost: prev?.webHost || fresh.webHost };
    if (!target.mailDomain && !target.webHost) {
      await db.insert(schema.tasks).values({ title: `Suivi mensuel de ${c.name} : aucun domaine connu, renseigne l'e-mail ou le site de la fiche`, companyId: c.id, dueDate: t, priority: "haute" });
      manual++;
      continue;
    }
    const d = await diagnose(target, opts.probe ?? publicProbe, t);
    await db.insert(schema.companyDiagnostics).values({ companyId: c.id, status: "fait", mailDomain: d.mailDomain, webHost: d.webHost, findings: JSON.stringify(d.checks), mainFinding: d.main, certainCount: d.certainCount, rulesVersion: d.rulesVersion, checkedOn: d.checkedOn });
    const diff = compareChecks(prev ? parseChecks(prev.findings) : [], d.checks);
    if (diff.regressed.length) {
      await db.insert(schema.tasks).values({ title: `Suivi ${c.name} : ${diff.regressed.map((x) => x.label).join(", ")}`.slice(0, 300), companyId: c.id, dueDate: t, priority: "haute" });
      alerts++;
    }
    const mail = composeBilan({ company: c.name, prenom: ct && !/^standard$/i.test(ct.firstName) ? ct.firstName : "", mailDomain: d.mailDomain, webHost: d.webHost, today: t, checks: d.checks, fixed: diff.fixed, regressed: diff.regressed, signature });
    const to = (ct?.email ?? "").trim().toLowerCase();
    if (!brevoReady() || !EMAIL_RE.test(to)) {
      await db.insert(schema.tasks).values({ title: `Envoyer à la main le bilan mensuel de ${c.name} (${!brevoReady() ? "Brevo non configuré" : "pas d'e-mail de contact"}) : texte dans le journal de la fiche`, companyId: c.id, dueDate: t, priority: "haute" });
      await logEvent(db, c.id, "note", `Bilan mensuel à envoyer : ${mail.subject}\n\n${mail.text}`);
      manual++;
      continue;
    }
    const r = await sendBrevoMail({ from: billingSender(), to: { email: to }, replyTo: EMAIL_RE.test(s.email) ? s.email : brevoConfig().replyTo, subject: mail.subject, text: mail.text, tags: ["facturation", "suivi"] });
    if (r.ok) {
      await logEvent(db, c.id, "mail", `${BILAN_EVENT} à ${to} : ${mail.subject}`);
      sent++;
    } else {
      await db.insert(schema.tasks).values({ title: `Bilan mensuel de ${c.name} non envoyé (${r.error.slice(0, 120)}) : réessaie ou envoie-le à la main`, companyId: c.id, dueDate: t, priority: "haute" });
      manual++;
    }
  }
  const parts = [`${sent} bilan(s) envoyé(s)`, alerts ? `${alerts} alerte(s)` : "", manual ? `${manual} à faire à la main` : ""].filter(Boolean);
  return { ok: true, sent, alerts, manual, message: parts.join(" · ") };
}
