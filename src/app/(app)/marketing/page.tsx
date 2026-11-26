import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { POST_STATUS } from "@/lib/forms";
import { addDays, fd, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Cell, ModTable, ModTip, PillCell, Row, Stats, match } from "@/components/mod/layout";
import { FormButton } from "@/components/mod/record-dialog";
import { DeleteButton, PatchSelect } from "@/components/mod/cells";
import { Card } from "@/components/ui";
import { parseVisual } from "@/lib/post-visual";
import { PostPanel } from "./post-panel";

export const metadata = { title: "Marketing" };
const GRID = "100px 120px minmax(0,2.4fr) 140px 140px 40px";

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const t = today();
  const all = (await db.select().from(schema.posts).orderBy(asc(schema.posts.date)));
  const next = all.find((p) => p.date >= t && p.status !== "publie");
  // Posts à publier : non publiés, à partir d'une semaine en arrière (les retards restent visibles).
  const upcoming = all.filter((p) => p.status !== "publie" && p.date >= addDays(t, -7)).slice(0, 12);
  const rows = all.filter((p) => (!f || p.network === f) && match(q, p.topic, p.pillar));
  return (
    <>
      <PageHeader title="Marketing" actions={<FormButton form="post" label="Nouvelle publication" primary />} />
      <div className="flex flex-col gap-4">
        <ModTip>Ton calendrier éditorial. LinkedIn en vouvoiement, Instagram en tutoiement. Vise la régularité plutôt que le volume. Le jour d&apos;un post LinkedIn, le CRM t&apos;envoie un mail vers 7 h avec le texte et l&apos;image en pièce jointe.</ModTip>
        <Card title={`Posts à publier (${upcoming.length})`}>
          {upcoming.length ? (
            <ol className="divide-y divide-border-subtle">
              {upcoming.map((p) => (
                <li key={p.id}>
                  <details open={p.date === t}>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13px]">
                      <span className="num font-medium">{fd(p.date)}</span>
                      <span className={`pill tone-${p.date === t ? "ok" : p.date < t ? "warn" : "info"}`}>{p.date === t ? "Aujourd'hui" : p.date < t ? "En retard" : p.network}</span>
                      <span className="font-medium">{p.topic}</span>
                      <span className="text-muted-fg">{p.body ? "texte prêt" : "sans texte"}{parseVisual(p.visual) ? " · image prête" : ""}</span>
                    </summary>
                    <PostPanel id={p.id} body={p.body} visual={parseVisual(p.visual)} published={p.status === "publie"} today={p.date === t} />
                  </details>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-5 py-8 text-center text-[13px] text-muted-fg">Aucun post à venir. Ajoute une publication avec son texte et son image.</p>
          )}
        </Card>
        <Stats
          items={[
            { l: "Publiés ce mois", v: String(all.filter((p) => p.status === "publie" && p.date.startsWith(t.slice(0, 7))).length) },
            { l: "Programmés", v: String(all.filter((p) => p.status === "programme").length) },
            { l: "Idées en stock", v: String(all.filter((p) => p.status === "idee").length) },
            { l: "Prochaine publication", v: next ? fd(next.date) : "—", s: next ? `${next.network} · ${next.topic}` : "Ajoute une publication" },
          ]}
        />
        <ModTable
          base="/marketing"
          q={q}
          f={f}
          filters={[
            { k: "", l: "Tous", n: all.length },
            { k: "LinkedIn", l: "LinkedIn" },
            { k: "Instagram", l: "Instagram" },
          ]}
          cols={["Date", "Réseau", "Sujet", "Pilier", "Statut", ""]}
          grid={GRID}
          minW={820}
          empty="Aucune publication prévue."
          count={rows.length}
        >
          {rows.map((p) => (
            <Row key={p.id} grid={GRID}>
              <Cell t={fd(p.date)} className="num" />
              <PillCell t={p.network} tone={p.network === "LinkedIn" ? "info" : "warn"} />
              <Cell t={p.topic} />
              <Cell t={p.pillar} className="text-muted-fg" />
              <PatchSelect entity="post" id={p.id} field="status" value={p.status} options={POST_STATUS} label="Statut de la publication" />
              <DeleteButton entity="post" id={p.id} />
            </Row>
          ))}
        </ModTable>
      </div>
    </>
  );
}
