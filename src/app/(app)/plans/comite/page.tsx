import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings } from "@/server/core";
import { fd, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { TextDoc } from "@/components/documents/text-doc";

export const metadata = { title: "Comité sécurité" };
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export default async function ComitePage({ searchParams }: { searchParams: Promise<{ co?: string; m?: string }> }) {
  const { co = "", m = today().slice(0, 7) } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(m) ? m : today().slice(0, 7);
  const c = await db.query.companies.findFirst({
    where: eq(schema.companies.id, co),
    with: { contacts: { where: eq(schema.contacts.isPrimary, true), limit: 1 }, securityActions: true, incidents: true, tickets: true, missions: { with: { times: true } } },
  });
  if (!c) notFound();
  const s = (await getSettings());
  const t = today();
  const label = `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
  const acs = c.securityActions;
  const done = acs.filter((a) => a.status === "fait"),
    doing = acs.filter((a) => a.status === "en_cours"),
    next = acs.filter((a) => a.status === "a_faire");
  const hours = c.missions.flatMap((x) => x.times).filter((x) => x.date.startsWith(month)).reduce((a, x) => a + x.hours, 0);
  const ct = c.contacts[0];
  const L = ["COMPTE RENDU — COMITÉ SÉCURITÉ", `${c.name} · ${label}`, `Participants : ${ct ? `${ct.firstName} ${ct.lastName}` : "[dirigeant]"}, ${s.legalName || "[Ton nom]"} (RSSI externalisé)`, ""];
  L.push(`1. AVANCEMENT DU PLAN D'ACTION — ${done.length} / ${acs.length} actions terminées`);
  if (doing.length) {
    L.push("En cours :");
    doing.forEach((a) => L.push(`· ${a.title} (${a.owner}${a.due ? `, échéance ${fd(a.due)}` : ""})`));
  }
  if (next.length) {
    L.push("À lancer :");
    next.forEach((a) => L.push(`· [${a.priority}] ${a.title}${a.due ? ` — ${fd(a.due)}` : ""}${a.due && a.due < t ? " ⚠ en retard" : ""}`));
  }
  if (done.length) {
    L.push("Terminées :");
    done.forEach((a) => L.push(`· ${a.title}`));
  }
  L.push("", "2. INCIDENTS");
  if (!c.incidents.length) L.push("· Aucun incident déclaré.");
  c.incidents.forEach((i) => L.push(`· ${fd(i.date)} — ${i.title} (${i.type}, gravité ${i.severity}, ${i.status === "clos" ? "clos" : "en cours"})${i.actions ? ` : ${i.actions}` : ""}`));
  L.push("", "3. SUPPORT");
  L.push(`· ${c.tickets.filter((x) => x.status !== "resolu").length} demande(s) ouverte(s), ${c.tickets.filter((x) => x.status === "resolu").length} résolue(s).`);
  c.tickets.forEach((x) => L.push(`  – ${x.subject} (${x.status === "resolu" ? "résolu" : "ouvert"})`));
  L.push("", `4. TEMPS CONSACRÉ EN ${label.toUpperCase()}`, `· ${String(Math.round(hours * 10) / 10).replace(".", ",")} h`);
  L.push("", "5. DÉCISIONS ET PROCHAINES ÉTAPES", "· [à compléter pendant le comité]", "", "Prochain comité : [date]");
  return (
    <>
      <PageHeader title={`Comité sécurité — ${c.name}`} subtitle={label} back={{ href: "/plans", label: "Plans d'action" }} />
      <TextDoc title={`Comité sécurité — ${c.name}`} text={L.join("\n")} />
    </>
  );
}
