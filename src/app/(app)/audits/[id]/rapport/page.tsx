import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings } from "@/server/core";
import { CONTROLS, auditReportText } from "@/lib/audit";
import { PageHeader } from "@/components/ui";
import { TextDoc } from "@/components/documents/text-doc";

export const metadata = { title: "Rapport d'audit" };

export default async function AuditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await db.query.audits.findFirst({ where: eq(schema.audits.id, id), with: { company: { columns: { name: true } } } });
  if (!a) notFound();
  const s = (await getSettings());
  const answers = JSON.parse(a.answers || "{}") as Record<string, string>;
  const notes = JSON.parse(a.notes || "{}") as Record<string, string>;
  let text = auditReportText({ date: a.date, answers }, a.company.name, s.legalName, s.tradeName);
  const withNotes = CONTROLS.filter((c) => notes[c.id]);
  if (withNotes.length) text += "\n\nCONSTATS DÉTAILLÉS\n" + withNotes.map((c) => `· ${c.q}\n  ${notes[c.id]}`).join("\n");
  return (
    <>
      <PageHeader title={`Rapport d'audit — ${a.company.name}`} back={{ href: `/audits/${a.id}`, label: "Audit" }} />
      <TextDoc title={`Rapport d'audit — ${a.company.name}`} text={text} />
    </>
  );
}
