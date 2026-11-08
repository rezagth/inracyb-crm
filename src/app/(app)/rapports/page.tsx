import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { STAGES } from "@/lib/constants";
import { eur, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Inspector, ReportDownload } from "./inspector";

export const metadata = { title: "Rapports" };
const METRICS = { ca: "CA signé (HT)", pipe: "Montant du pipeline", count: "Nombre d'entreprises", calls: "Nombre d'appels" } as const;
const GROUPS = { mois: "Mois", secteur: "Secteur", source: "Source", etape: "Étape" } as const;
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const COLORS = ["var(--accent)", "var(--ok-fg)", "var(--warn-fg)", "var(--info-fg)", "var(--ko-fg)", "var(--muted-fg)"];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ metric?: string; group?: string; viz?: string }> }) {
  const sp = await searchParams;
  const metric = (sp.metric && sp.metric in METRICS ? sp.metric : "ca") as keyof typeof METRICS;
  const group = (sp.group && sp.group in GROUPS ? sp.group : "mois") as keyof typeof GROUPS;
  const viz = sp.viz === "h" ? "h" : "v";
  const companies = (await db.select().from(schema.companies));
  const quotes = (await db.select().from(schema.quotes)).filter((q) => q.status === "accepte");
  const calls = (await db.select().from(schema.calls));
  const coById = new Map(companies.map((c) => [c.id, c]));
  const t = today();
  const monthKeys = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1 - (5 - k), 1));
    return d.toISOString().slice(0, 7);
  });
  type Item = { key: string; month: string; secteur: string; source: string; etape: string; value: number };
  let items: Item[];
  const base = (c: (typeof companies)[number] | undefined) => ({ secteur: c?.sector ?? "—", source: c?.source ?? "—", etape: STAGES.find((s) => s.id === c?.stage)?.label ?? "—" });
  if (metric === "ca") items = quotes.map((q) => ({ key: q.id, month: (q.signedAt ? q.signedAt.toISOString() : q.issueDate).slice(0, 7), ...base(coById.get(q.companyId)), value: q.totalHtCents }));
  else if (metric === "pipe") items = companies.filter((c) => !["gagne", "perdu"].includes(c.stage)).map((c) => ({ key: c.id, month: c.createdAt.toISOString().slice(0, 7), ...base(c), value: c.amountCents }));
  else if (metric === "count") items = companies.map((c) => ({ key: c.id, month: c.createdAt.toISOString().slice(0, 7), ...base(c), value: 1 }));
  else items = calls.map((x) => ({ key: x.id, month: x.date.slice(0, 7), ...base(coById.get(x.companyId)), value: 1 }));
  const money = metric === "ca" || metric === "pipe";
  const buckets = new Map<string, number>();
  if (group === "mois") monthKeys.forEach((k) => buckets.set(k, 0));
  for (const it of items) {
    const k = group === "mois" ? it.month : it[group];
    if (group === "mois" && !buckets.has(k)) continue;
    buckets.set(k, (buckets.get(k) ?? 0) + it.value);
  }
  const rows = [...buckets.entries()].map(([k, v]) => ({ l: group === "mois" ? `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(2, 4)}` : k, v }));
  if (group !== "mois") rows.sort((a, b) => b.v - a.v);
  const total = rows.reduce((a, r) => a + r.v, 0);
  const max = Math.max(1, ...rows.map((r) => r.v));
  const fmt = (v: number) => (money ? eur(v, { round: true }) : String(v));
  const saved = (await db.select().from(schema.savedReports).orderBy(desc(schema.savedReports.createdAt)));
  const title = `${METRICS[metric]} par ${GROUPS[group].toLowerCase()}`;
  return (
    <>
      <PageHeader title="Rapports" subtitle="Choisis la métrique, le regroupement et la visualisation : l'aperçu se met à jour tout de suite." />
      <section className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          <article className="card rise flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-medium">{title}</h2>
                <span className="num text-[22px] font-semibold">{fmt(total)}</span>
              </div>
              <ReportDownload filename={`rapport-${metric}-${group}.csv`} header={[GROUPS[group], METRICS[metric]]} rows={rows.map((r) => [r.l, money ? (r.v / 100).toFixed(2).replace(".", ",") : String(r.v)])} />
            </div>
            {viz === "v" ? (
              <>
                <div className="flex h-[220px] items-end gap-2.5 border-b border-border px-1">
                  {rows.map((r, i) => (
                    <div key={r.l} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${r.l} : ${fmt(r.v)}`}>
                      <span className="num text-[11px] text-subtle-fg">{r.v ? fmt(r.v) : ""}</span>
                      <span className="block w-[70%] max-w-[44px] rounded-t-md" style={{ height: `${Math.max(2, (r.v / max) * 170)}px`, background: group === "mois" ? "var(--accent)" : COLORS[i % COLORS.length] }} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2.5 px-1 text-xs text-subtle-fg">
                  {rows.map((r) => (
                    <span key={r.l} className="flex-1 truncate text-center">
                      {r.l}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2.5">
                {rows.map((r, i) => (
                  <div key={r.l} className="grid grid-cols-[140px_minmax(0,1fr)_96px] items-center gap-2.5 text-[13px]">
                    <span className="truncate text-muted-fg">{r.l}</span>
                    <span className="block h-3 rounded-full bg-muted">
                      <span className="block h-full rounded-full" style={{ width: `${(r.v / max) * 100}%`, background: COLORS[i % COLORS.length] }} />
                    </span>
                    <span className="num text-right font-medium">{fmt(r.v)}</span>
                  </div>
                ))}
              </div>
            )}
            {!total && <p className="text-center text-[13px] text-muted-fg">Pas encore de données pour cette métrique.</p>}
          </article>
          <article className="card rise overflow-hidden p-0" style={{ animationDelay: "80ms" }}>
            <div className="thead grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_90px] gap-3 px-5">
              <span>{GROUPS[group]}</span>
              <span className="text-right">Valeur</span>
              <span className="text-right">Part</span>
            </div>
            {rows.map((r) => (
              <div key={r.l} className="trow grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_90px] items-center gap-3 px-5">
                <span>{r.l}</span>
                <span className="num text-right">{fmt(r.v)}</span>
                <span className="num text-right text-muted-fg">{total ? Math.round((r.v / total) * 100) : 0} %</span>
              </div>
            ))}
          </article>
        </div>
        <Inspector metric={metric} group={group} viz={viz} metrics={METRICS} groups={GROUPS} saved={saved.map((x) => ({ id: x.id, name: x.name, config: x.config }))} />
      </section>
    </>
  );
}
