import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { companyOptions } from "@/server/queries";
import { ACTION_STATUS } from "@/lib/forms";
import { fd, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Cell, LinkCell, ModTable, ModTip, Panel, Panels, PillCell, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { DeleteButton, PatchSelect } from "@/components/mod/cells";
import { ComiteButton } from "./comite-button";

export const metadata = { title: "Plans d'action" };
const GRID = "minmax(0,2.6fr) 110px 120px 140px 140px 40px";
const PRIO = { haute: ["Haute", "ko"], moyenne: ["Moyenne", "warn"], basse: ["Basse", "neu"] } as const;

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; co?: string }> }) {
  const { q = "", f = "", co = "" } = await searchParams;
  const t = today();
  const all = await db.query.securityActions.findMany({ orderBy: [asc(schema.securityActions.status), asc(schema.securityActions.due)], with: { company: { columns: { id: true, name: true } } } });
  const open = all.filter((a) => a.status !== "fait");
  const late = open.filter((a) => a.due && a.due < t);
  const byCo = new Map<string, { name: string; d: number; t: number }>();
  all.forEach((a) => {
    const x = byCo.get(a.companyId) ?? { name: a.company.name, d: 0, t: 0 };
    x.t++;
    if (a.status === "fait") x.d++;
    byCo.set(a.companyId, x);
  });
  const rows = all.filter((a) => (!co || a.companyId === co) && (!f || (f === "ouvertes" ? a.status !== "fait" : a.status === "fait")) && match(q, a.title, a.company.name, a.owner));
  const companies = (await companyOptions());
  return (
    <>
      <PageHeader title="Plans d'action" />
      <div className="flex flex-col gap-4">
        <ModTip>Les recommandations de tes audits et le plan de sécurité de chaque client RSSI, action par action. C&apos;est ce que tu présentes en comité mensuel.</ModTip>
        <Stats
          items={[
            { l: "Actions ouvertes", v: String(open.length) },
            { l: "Priorité haute ouvertes", v: String(open.filter((a) => a.priority === "haute").length), alert: open.some((a) => a.priority === "haute") },
            { l: "En retard", v: String(late.length), s: "échéance dépassée", alert: late.length > 0 },
            { l: "Avancement global", v: all.length ? `${Math.round(((all.length - open.length) / all.length) * 100)} %` : "—" },
          ]}
        />
        {byCo.size > 0 && (
          <Panels>
            <Panel title="Avancement par client" rows={[...byCo.values()].map((x) => ({ l: x.name, v: `${x.d} / ${x.t} actions`, pct: (x.d / x.t) * 100, color: "var(--ok-fg)" }))} />
          </Panels>
        )}
        <ModTable
          base="/plans"
          q={q}
          f={f}
          extraParams={co ? { co } : undefined}
          filters={[
            { k: "", l: "Toutes", n: all.length },
            { k: "ouvertes", l: "Ouvertes", n: open.length },
            { k: "faites", l: "Faites" },
          ]}
          actions={
            <>
              <ComiteButton companies={companies} />
              <FormButton form="action" label="Nouvelle action" primary small companies={companies} preset={co ? { companyId: co } : undefined} />
            </>
          }
          cols={["Action", "Priorité", "Responsable", "Échéance", "Statut", ""]}
          grid={GRID}
          minW={880}
          empty="Aucune action dans cette vue. Génère-les depuis un audit ou ajoute-les à la main."
          count={rows.length}
        >
          {rows.map((a) => {
            const p = PRIO[a.priority as keyof typeof PRIO] ?? PRIO.moyenne;
            const isLate = a.status !== "fait" && a.due && a.due < t;
            return (
              <Row key={a.id} grid={GRID}>
                <LinkCell href={`/plans?co=${a.company.id}`} t={a.title} sub={a.company.name} />
                <PillCell t={p[0]} tone={p[1]} />
                <Cell t={a.owner} className="text-muted-fg" />
                {!a.due ? <Cell t="—" className="text-subtle-fg" /> : isLate ? <PillCell t="En retard" tone="ko" sub={fd(a.due)} /> : <Cell t={fd(a.due)} className="num" />}
                <PatchSelect entity="action" id={a.id} field="status" value={a.status} options={ACTION_STATUS} label="Statut de l'action" />
                <DeleteButton entity="action" id={a.id} />
              </Row>
            );
          })}
        </ModTable>
      </div>
    </>
  );
}
