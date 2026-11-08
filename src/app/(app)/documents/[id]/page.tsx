import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { companyOptions } from "@/server/queries";
import { DOC_STATUS } from "@/lib/forms";
import { fd } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { FormButton } from "@/components/mod/record-dialog";
import { TextDoc } from "@/components/documents/text-doc";

export const metadata = { title: "Document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await db.query.documents.findFirst({ where: eq(schema.documents.id, id), with: { company: { columns: { name: true } } } });
  if (!d) notFound();
  const st = DOC_STATUS.find(([k]) => k === d.status)?.[1] ?? d.status;
  return (
    <>
      <PageHeader
        title={d.name}
        subtitle={`${d.type}${d.company ? ` · ${d.company.name}` : ""} · ${st} · mis à jour le ${fd(d.updatedOn)}`}
        back={{ href: "/documents", label: "Documents" }}
        actions={<FormButton form="doc" id={d.id} label="Modifier" icon="note" companies={(await companyOptions())} preset={{ name: d.name, type: d.type, status: d.status, companyId: d.companyId ?? "", body: d.body }} />}
      />
      {d.body ? <TextDoc title={d.name} text={d.body} /> : <p className="tip">Ce document est vide. Clique « Modifier » pour coller le texte du modèle ou le lien vers le fichier.</p>}
    </>
  );
}
