import "server-only";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { BOOKED_REASON, CAL_MARK, splitName, type CalBooking } from "@/lib/cal-booking";
import { addBusinessDays } from "@/lib/call-queue";
import { stageOf, stageRank } from "@/lib/constants";
import { parseChecks } from "@/lib/diagnostic";
import { addDays, fd, today } from "@/lib/format";
import { OFFER_LABEL, OFFER_WHY, offersForCompany } from "@/lib/pack-quote";
import { brevoReady, sendBrevoMail } from "./brevo";
import { appUrl } from "./campaigns";
import { logEvent } from "./core";
import { queueDiagnostics, runDiagnostics } from "./diagnostic";
import { recipient } from "./weekly-report";

export type CalResult = { ok: true; message: string } | { ok: false; status: number; error: string };

const mark = (uid: string) => `${CAL_MARK} ${uid}`;

async function meetingOf(uid: string) {
  if (!uid) return undefined;
  return (await db.select().from(schema.meetings).where(like(schema.meetings.note, `%${mark(uid).replace(/[%_\\]/g, "\\$&")}%`)).limit(1))[0];
}

/** Fiche de l'entreprise : par l'adresse du contact, sinon par le domaine (adresses ou site), sinon créée. */
async function companyFor(b: CalBooking): Promise<{ id: string; name: string; stage: string; sector: string; created: boolean }> {
  const byMail = (await db.select({ companyId: schema.contacts.companyId, id: schema.contacts.id, phone: schema.contacts.phone }).from(schema.contacts).where(sql`lower(${schema.contacts.email}) = ${b.email}`).limit(1))[0];
  // Téléphone saisi dans Cal : ajouté au contact s'il n'en avait pas (jamais remplacé).
  if (byMail && b.phone && !byMail.phone.trim()) await db.update(schema.contacts).set({ phone: b.phone }).where(eq(schema.contacts.id, byMail.id));
  let id = byMail?.companyId;
  if (!id && b.domain) {
    const byDomain = (await db.select({ companyId: schema.contacts.companyId }).from(schema.contacts).where(sql`lower(${schema.contacts.email}) like ${"%@" + b.domain}`).limit(1))[0];
    id = byDomain?.companyId;
    if (!id) id = (await db.select({ id: schema.companies.id }).from(schema.companies).where(sql`lower(${schema.companies.notes}) like ${"%" + b.domain + "%"}`).limit(1))[0]?.id;
  }
  if (id) {
    const c = (await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1))[0];
    if (c) {
      if (!byMail) {
        const { firstName, lastName } = splitName(b.name);
        await db.insert(schema.contacts).values({ companyId: c.id, firstName: firstName || "Contact", lastName, email: b.email, emailSource: "formulaire", phone: b.phone, isPrimary: false });
      }
      return { id: c.id, name: c.name, stage: c.stage, sector: c.sector, created: false };
    }
  }
  const name = b.company || b.domain || b.name || b.email;
  const c = (await db.insert(schema.companies).values({ name, source: "Réservation en ligne", stage: "rdv", priority: "haute", notes: b.domain ? `Site web : https://${b.domain}` : "" }).returning())[0];
  const { firstName, lastName } = splitName(b.name);
  await db.insert(schema.contacts).values({ companyId: c.id, firstName: firstName || "Contact", lastName, email: b.email, emailSource: "formulaire", phone: b.phone, isPrimary: true });
  await logEvent(db, c.id, "create", `Entreprise créée par une réservation en ligne (Cal.com) : ${b.name || b.email}`);
  return { id: c.id, name: c.name, stage: "rdv", sector: c.sector, created: true };
}

/** Constat principal et offre recommandée, pour la fiche de préparation. */
async function prepNotes(companyId: string, sector: string): Promise<{ finding: string; offer: string }> {
  const d = (await db.select({ findings: schema.companyDiagnostics.findings, main: schema.companyDiagnostics.mainFinding }).from(schema.companyDiagnostics).where(and(eq(schema.companyDiagnostics.companyId, companyId), eq(schema.companyDiagnostics.status, "fait"))).orderBy(desc(schema.companyDiagnostics.createdAt)).limit(1))[0];
  const checks = parseChecks(d?.findings ?? "[]");
  const main = checks.find((c) => c.id === d?.main) ?? checks.find((c) => c.status === "constat" && c.certain);
  const top = offersForCompany(sector, d?.findings ?? "[]")[0];
  return { finding: main ? main.wording : d ? "Aucun constat certain sur le domaine." : "Pas encore de diagnostic du domaine.", offer: top ? `${OFFER_LABEL[top]} (${OFFER_WHY[top]})` : "" };
}

async function notifyOwner(subject: string, lines: string[]) {
  if (!brevoReady()) return;
  const to = await recipient();
  if (to) await sendBrevoMail({ to: { email: to }, subject, text: lines.filter(Boolean).join("\n\n") + "\n", tags: ["rdv"] });
}

const when = (b: { date: string; start: string }) => `${fd(b.date)} à ${b.start}`;

/**
 * Réservation Cal.com : création (fiche, rendez-vous, relances arrêtées, étape « RDV planifié », diagnostic, tâche de
 * préparation, mail), report (rendez-vous déplacé) ou annulation (rendez-vous retiré, tâche de relance). Rejouable :
 * une même réservation n'est jamais créée deux fois.
 */
export async function handleCalBooking(b: CalBooking): Promise<CalResult> {
  const t = today();
  const base = appUrl();

  if (b.trigger === "BOOKING_CANCELLED") {
    const m = await meetingOf(b.uid);
    if (!m) return { ok: true, message: "Réservation inconnue : rien à annuler." };
    await db.delete(schema.meetings).where(eq(schema.meetings.id, m.id));
    if (m.companyId) {
      const c = (await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, m.companyId)).limit(1))[0];
      await logEvent(db, m.companyId, "note", `Rendez-vous du ${when(m)} annulé sur Cal.com.`);
      await db.insert(schema.tasks).values({ title: `Relancer ${c?.name ?? b.email} : rendez-vous du ${fd(m.date)} annulé`.slice(0, 300), companyId: m.companyId, dueDate: addBusinessDays(t, 2), priority: "haute" });
      await notifyOwner(`RDV annulé : ${c?.name ?? b.email} (${when(m)})`, [`${b.name || b.email} a annulé le rendez-vous du ${when(m)}.`, "Une tâche « Relancer » est prévue dans 2 jours ouvrés.", base ? `Fiche : ${base}/entreprises/${m.companyId}` : ""]);
    }
    return { ok: true, message: "Rendez-vous annulé." };
  }

  const previous = b.trigger === "BOOKING_RESCHEDULED" ? ((await meetingOf(b.previousUid)) ?? (await meetingOf(b.uid))) : undefined;
  if (previous) {
    const note = previous.note.replace(new RegExp(`${CAL_MARK} [\\w-]+`), mark(b.uid));
    await db.update(schema.meetings).set({ date: b.date, start: b.start, end: b.end, location: b.location || previous.location, note }).where(eq(schema.meetings.id, previous.id));
    if (previous.companyId) {
      await logEvent(db, previous.companyId, "note", `Rendez-vous déplacé sur Cal.com : du ${when(previous)} au ${when(b)}.`);
      await db.update(schema.tasks).set({ dueDate: b.date > t ? addDays(b.date, -1) : t }).where(and(eq(schema.tasks.companyId, previous.companyId), like(schema.tasks.title, "Préparer le rendez-vous%"), eq(schema.tasks.done, false)));
      await notifyOwner(`RDV déplacé : ${b.company || b.email} (${when(b)})`, [`${b.name || b.email} a déplacé le rendez-vous du ${when(previous)} au ${when(b)}.`, base ? `Fiche : ${base}/entreprises/${previous.companyId}` : ""]);
    }
    return { ok: true, message: "Rendez-vous déplacé." };
  }

  if (await meetingOf(b.uid)) return { ok: true, message: "Réservation déjà enregistrée." };

  const c = await companyFor(b);
  const title = `${b.eventTitle} — ${c.name}`.slice(0, 200);
  const note = [mark(b.uid), `Réservé par ${b.name || "?"} (${b.email}${b.phone ? `, ${b.phone}` : ""})`, b.topic && `Sujet : ${b.topic}`, b.domain && `Domaine : ${b.domain}`, b.notes && `Message : ${b.notes}`].filter(Boolean).join("\n");
  await db.transaction(async (tx) => {
    await tx.insert(schema.meetings).values({ companyId: c.id, title, date: b.date, start: b.start, end: b.end, mode: "Visio", location: b.location.slice(0, 300), note });
    await tx.update(schema.mailCampaignItems).set({ status: "arrete", stopReason: BOOKED_REASON }).where(and(eq(schema.mailCampaignItems.companyId, c.id), eq(schema.mailCampaignItems.status, "en_cours")));
    await tx.update(schema.tasks).set({ done: true, doneAt: new Date() }).where(and(eq(schema.tasks.companyId, c.id), eq(schema.tasks.kind, "appel"), eq(schema.tasks.done, false)));
    if (!c.created && c.stage !== "perdu" && c.stage !== "gagne" && stageRank(c.stage) < stageRank("rdv")) {
      await tx.update(schema.companies).set({ stage: "rdv", lastContact: t }).where(eq(schema.companies.id, c.id));
      await logEvent(tx, c.id, "stage", `Étape : ${stageOf(c.stage).label} → RDV planifié`);
    }
    await logEvent(tx, c.id, "note", `Rendez-vous réservé sur Cal.com : ${title}, le ${when(b)}${b.topic ? ` (sujet : ${b.topic})` : ""}. Relances arrêtées.`);
    const prep = `Préparer le rendez-vous : ${title}`.slice(0, 300);
    if (!(await tx.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.title, prep), eq(schema.tasks.done, false)))).length) {
      await tx.insert(schema.tasks).values({ title: prep, companyId: c.id, dueDate: b.date > t ? addDays(b.date, -1) : t, priority: "haute" });
    }
  });

  // Diagnostic du domaine avant le rendez-vous, s'il n'y en a pas de récent (lectures publiques, borné dans le temps).
  if (b.domain) {
    const recent = (await db.select({ on: schema.companyDiagnostics.checkedOn }).from(schema.companyDiagnostics).where(and(eq(schema.companyDiagnostics.companyId, c.id), eq(schema.companyDiagnostics.status, "fait"))).orderBy(desc(schema.companyDiagnostics.createdAt)).limit(1))[0];
    if (!recent || recent.on < addDays(t, -14)) {
      await queueDiagnostics([c.id]);
      await runDiagnostics({ budgetMs: 15_000, batch: 1 }).catch(() => undefined);
    }
  }
  const prep = await prepNotes(c.id, c.sector);
  await notifyOwner(`Nouveau RDV : ${c.name} — ${when(b)}`, [
    `${b.name || "Un prospect"} (${b.email}${b.phone ? `, ${b.phone}` : ""}) a réservé « ${b.eventTitle} » le ${when(b)}.`,
    [b.topic && `Sujet choisi : ${b.topic}`, b.domain && `Domaine : ${b.domain}`, b.notes && `Message : ${b.notes}`, b.location && `Lien : ${b.location}`].filter(Boolean).join("\n"),
    `Constat sur le domaine : ${prep.finding}`,
    prep.offer ? `Offre à proposer : ${prep.offer}. Le devis se crée en un clic depuis la fiche.` : "",
    c.created ? "Nouvelle fiche créée dans le CRM." : "Fiche existante : relances de campagne arrêtées, étape « RDV planifié ».",
    base ? `Fiche : ${base}/entreprises/${c.id}` : "",
  ]);
  return { ok: true, message: `Rendez-vous enregistré pour ${c.name}.` };
}
