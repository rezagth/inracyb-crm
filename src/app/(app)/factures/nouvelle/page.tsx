import { companyOptions, listCatalog } from "@/server/queries";
import { getSettings } from "@/server/core";
import { addDays, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { DocEditor } from "@/components/documents/doc-editor";

export const metadata = { title: "Nouvelle facture" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ co?: string }> }) {
  const { co = "" } = await searchParams;
  const s = (await getSettings());
  const t = today();
  return (
    <>
      <PageHeader title="Nouvelle facture" back={{ href: "/factures", label: "Factures" }} />
      <DocEditor
        kind="facture"
        id={null}
        companies={(await companyOptions())}
        catalog={(await listCatalog(true))}
        initial={{ companyId: co, subject: "", issueDate: t, dueDate: addDays(t, s.payDays), discountPct: "0", note: "", lines: [] }}
        tvaFranchise={s.tvaFranchise}
        dueDays={s.payDays}
      />
    </>
  );
}
