import { notFound } from "next/navigation";
import { companyOptions, getQuote, listCatalog } from "@/server/queries";
import { getSettings } from "@/server/core";
import { addDays, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { DocEditor, type DocInitial } from "@/components/documents/doc-editor";

export const metadata = { title: "Nouveau devis" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ co?: string; dup?: string }> }) {
  const { co = "", dup } = await searchParams;
  const s = (await getSettings());
  const t = today();
  let initial: DocInitial = { companyId: co, subject: "", issueDate: t, dueDate: addDays(t, 30), discountPct: "0", note: "", lines: [] };
  if (dup) {
    const q = await getQuote(dup);
    if (!q) notFound();
    initial = { ...initial, companyId: q.companyId, subject: q.subject, discountPct: String(q.discountBp / 100), note: q.note, lines: q.lines };
  }
  return (
    <>
      <PageHeader title={dup ? "Dupliquer un devis" : "Nouveau devis"} back={{ href: "/devis", label: "Devis" }} />
      <DocEditor kind="devis" id={null} companies={(await companyOptions())} catalog={(await listCatalog(true))} initial={initial} tvaFranchise={s.tvaFranchise} dueDays={30} />
    </>
  );
}
