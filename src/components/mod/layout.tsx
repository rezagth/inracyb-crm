import Link from "next/link";
import type { Tone } from "@/lib/constants";
import { Icon } from "@/components/icon";

/** Bandeau d'explication en haut d'un module (comme dans la maquette). */
export function ModTip({ children }: { children: React.ReactNode }) {
  return <p className="tip rise text-[13px]">{children}</p>;
}

export type Stat = { l: string; v: string; s?: string; alert?: boolean };
export function Stats({ items }: { items: Stat[] }) {
  return (
    <section className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
      {items.map((k, i) => (
        <article key={k.l} className={`card rise flex flex-col gap-1.5 p-5 ${k.alert ? "border-[var(--ko-fg)]" : ""}`} style={{ animationDelay: `${i * 50}ms` }}>
          <span className="text-[13px] text-muted-fg">{k.l}</span>
          <span className="num text-2xl font-semibold tracking-tight">{k.v}</span>
          {k.s && <span className={`text-xs ${k.alert ? "text-ko" : "text-subtle-fg"}`}>{k.s}</span>}
        </article>
      ))}
    </section>
  );
}

export type PanelRow = { l: string; v: string; pct?: number; color?: string; strong?: boolean; tone?: "ko" | "ok" };
export function Panel({ title, rows, note, children }: { title: string; rows?: PanelRow[]; note?: string; children?: React.ReactNode }) {
  return (
    <article className="card rise flex flex-col gap-3 p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows?.map((r) => (
        <div key={r.l} className="flex flex-col gap-1.5 text-[13px]">
          <div className="flex justify-between gap-3">
            <span className="text-muted-fg">{r.l}</span>
            <span className={`num text-right font-semibold ${r.tone === "ko" ? "text-ko" : r.tone === "ok" ? "text-ok" : ""}`}>{r.v}</span>
          </div>
          {r.pct !== undefined && (
            <span className="block h-1.5 rounded-full bg-muted">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, r.pct))}%`, background: r.color ?? "var(--accent)" }} />
            </span>
          )}
        </div>
      ))}
      {children}
      {note && <p className="tip">{note}</p>}
    </article>
  );
}

export function Panels({ children }: { children: React.ReactNode }) {
  return <section className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">{children}</section>;
}

export type Filter = { k: string; l: string; n?: number };

/** Tableau de module : titre, recherche, filtres, actions, en-tête et lignes en grille. */
export function ModTable({
  title,
  base,
  q,
  f,
  filters,
  actions,
  cols,
  grid,
  minW = 760,
  empty,
  children,
  count,
  search = true,
  extraParams,
}: {
  title?: string;
  base: string;
  q?: string;
  f?: string;
  filters?: Filter[];
  actions?: React.ReactNode;
  cols: string[];
  grid: string;
  minW?: number;
  empty: string;
  children: React.ReactNode;
  count: number;
  search?: boolean;
  extraParams?: Record<string, string>;
}) {
  const href = (k: string) => {
    const p = new URLSearchParams(extraParams);
    if (q) p.set("q", q);
    if (k) p.set("f", k);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  return (
    <section className="card rise overflow-hidden p-0" style={{ animationDelay: "150ms" }}>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border-subtle px-5 py-3.5">
        {title && <h2 className="mr-2 text-sm font-medium">{title}</h2>}
        {search && (
          <form action={base} className="flex h-9 w-[240px] max-w-full items-center gap-2 rounded-lg border border-border px-2.5 text-subtle-fg">
            <Icon name="search" />
            {f && <input type="hidden" name="f" value={f} />}
            {Object.entries(extraParams ?? {}).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <input name="q" defaultValue={q} placeholder="Rechercher…" aria-label="Rechercher" className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none" />
          </form>
        )}
        {filters && (
          <nav className="seg" aria-label="Filtre">
            {filters.map((x) => (
              <Link key={x.k} href={href(x.k)} className={(f ?? "") === x.k ? "on" : ""} aria-current={(f ?? "") === x.k ? "page" : undefined}>
                {x.l} {x.n !== undefined && <span className="num text-subtle-fg">{x.n}</span>}
              </Link>
            ))}
          </nav>
        )}
        <span className="flex-1" />
        {actions}
      </div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: minW }}>
          <div className="thead grid gap-3 px-5" style={{ gridTemplateColumns: grid }}>
            {cols.map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </div>
          {count === 0 ? <div className="border-t border-border-subtle px-5 py-8 text-center text-[13px] text-muted-fg">{empty}</div> : children}
        </div>
      </div>
    </section>
  );
}

export function Row({ grid, children }: { grid: string; children: React.ReactNode }) {
  return (
    <div className="trow grid items-center gap-3 px-5 py-1.5" style={{ gridTemplateColumns: grid }}>
      {children}
    </div>
  );
}

/** Cellule texte avec sous-texte optionnel. */
export function Cell({ t, sub, className = "", title }: { t: React.ReactNode; sub?: React.ReactNode; className?: string; title?: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className={`truncate ${className}`} title={title ?? (typeof t === "string" ? t : undefined)}>
        {t}
      </span>
      {sub && <span className="text-xs leading-snug text-subtle-fg">{sub}</span>}
    </span>
  );
}

export function LinkCell({ href, t, sub }: { href: string; t: string; sub?: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <Link href={href} className="link truncate font-medium" title={t}>
        {t}
      </Link>
      {sub && <span className="truncate text-xs text-subtle-fg">{sub}</span>}
    </span>
  );
}

export function PillCell({ t, tone, sub }: { t: string; tone: Tone; sub?: string }) {
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      <span className={`pill tone-${tone}`}>
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
        {t}
      </span>
      {sub && <span className="text-xs text-subtle-fg">{sub}</span>}
    </span>
  );
}

export function BarCell({ pct, t, color = "var(--accent)" }: { pct: number; t: string; color?: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="block h-1.5 flex-1 rounded-full bg-muted">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </span>
      <span className="num whitespace-nowrap text-xs text-subtle-fg">{t}</span>
    </span>
  );
}

export const match = (q: string | undefined, ...xs: (string | null | undefined)[]) => !q || xs.join(" ").toLowerCase().includes(q.toLowerCase());
