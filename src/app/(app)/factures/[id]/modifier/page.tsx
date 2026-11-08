import { notFound, redirect } from "next/navigation";
import { companyOptions, getInvoice, listCatalog } from "@/server/queries";
import { getSettings } from "@/server/core";
import { PageHeader } from "@/components/ui";
import { DocEditor } from "@/components/documents/doc-editor";

export const metadata = { title: "Modifier la facture" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const iv = await getInvoice(id);
  if (!iv) notFound();
  if (iv.status !== "brouillon") redirect(`/factures/${id}`);
  const s = (await getSettings());
  return (
    <>
      <PageHeader title="Modifier le brouillon" back={{ href: `/factures/${id}`, label: "Facture" }} />
      <DocEditor
        kind="facture"
        id={id}
        companies={(await companyOptions())}
        catalog={(await listCatalog(true))}
        initial={{ companyId: iv.companyId, subject: iv.subject, issueDate: iv.issueDate, dueDate: iv.dueDate, discountPct: String(iv.discountBp / 100), note: iv.note, lines: iv.lines }}
        tvaFranchise={s.tvaFranchise}
        dueDays={s.payDays}
      />
    </>
  );
}
