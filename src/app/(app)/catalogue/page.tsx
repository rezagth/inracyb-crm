import { listCatalog } from "@/server/queries";
import { OFFERS } from "@/lib/constants";
import { eur } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ItemForm, ItemRowActions } from "./item-form";

export const metadata = { title: "Catalogue" };

export default async function CatalogPage() {
  const items = (await listCatalog());
  return (
    <>
      <PageHeader title="Catalogue" subtitle="Tes prestations et leurs tarifs, à insérer en un clic dans les devis et factures." />
      <Card title="Nouvelle prestation" className="mb-4">
        <div className="p-5">
          <ItemForm />
        </div>
      </Card>
      {OFFERS.map((o) => {
        const list = items.filter((i) => i.offer === o.id);
        return (
          <Card key={o.id} title={o.label} className="mb-4">
            {list.length === 0 ? (
              <EmptyState title="Aucune prestation" />
            ) : (
              <ul>
                {list.map((i) => (
                  <li key={i.id} className={`grid gap-2 border-t border-border-subtle px-5 py-3 first:border-t-0 sm:grid-cols-[1fr_auto_auto] sm:items-start ${i.active ? "" : "opacity-60"}`}>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13px] font-medium">
                        {i.name} {!i.active && <Badge tone="neu">Archivée</Badge>}
                      </span>
                      {i.description && <span className="text-xs text-subtle-fg">{i.description}</span>}
                    </div>
                    <span className="num text-[13px] sm:text-right">
                      {eur(i.unitPriceCents)} <span className="text-xs text-subtle-fg">/ {i.unit}</span>
                    </span>
                    <div className="contents">
                      <ItemRowActions item={i} active={i.active} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </>
  );
}
