import { notFound, redirect } from "next/navigation";
import { companyOptions, getQuote, listCatalog } from "@/server/queries";
import { getSettings } from "@/server/core";
import { PageHeader } from "@/components/ui";
import { DocEditor } from "@/components/documents/doc-editor";

export const metadata = { title: "Modifier le devis" };

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = await getQuote(id);
  if (!q) notFound();
  if (q.status !== "brouillon") redirect(`/devis/${id}`);
  const s = (await getSettings());
  return (
    <>
      <PageHeader title="Modifier le brouillon" back={{ href: `/devis/${id}`, label: "Devis" }} />
      <DocEditor
        kind="devis"
        id={id}
        companies={(await companyOptions())}
        catalog={(await listCatalog(true))}
        initial={{ companyId: q.companyId, subject: q.subject, issueDate: q.issueDate, dueDate: q.validUntil, discountPct: String(q.discountBp / 100), note: q.note, lines: q.lines }}
        tvaFranchise={s.tvaFranchise}
        dueDays={30}
      />
    </>
  );
}
