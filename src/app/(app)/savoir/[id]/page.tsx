import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fd } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { FormButton } from "@/components/mod/record-dialog";
import { TextDoc } from "@/components/documents/text-doc";

export const metadata = { title: "Article" };

export default async function KbArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const k = (await db.select().from(schema.kbArticles).where(eq(schema.kbArticles.id, id)).limit(1))[0];
  if (!k) notFound();
  return (
    <>
      <PageHeader
        title={k.title}
        subtitle={`${k.category} · mis à jour le ${fd(k.updatedOn)}`}
        back={{ href: "/savoir", label: "Base de connaissances" }}
        actions={<FormButton form="kb" id={k.id} label="Modifier" icon="note" preset={{ title: k.title, category: k.category, body: k.body }} />}
      />
      <TextDoc title={k.title} text={k.body || "(article vide)"} />
    </>
  );
}
