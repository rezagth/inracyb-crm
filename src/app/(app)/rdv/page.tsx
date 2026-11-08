import Link from "next/link";
import { asc, like } from "drizzle-orm";
import { db, schema } from "@/db";
import { companyOptions } from "@/server/queries";
import { addDays, fd, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icon";
import { FormButton } from "@/components/mod/record-dialog";
import { DeleteButton } from "@/components/mod/cells";

export const metadata = { title: "Rendez-vous" };
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export default async function RdvPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string; new?: string; co?: string }> }) {
  const sp = await searchParams;
  const t = today();
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : t.slice(0, 7);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d! : month === t.slice(0, 7) ? t : `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const inMonth = await db.query.meetings.findMany({ where: like(schema.meetings.date, `${month}-%`), orderBy: [asc(schema.meetings.date), asc(schema.meetings.start)], with: { company: { columns: { id: true, name: true } } } });
  const upcoming = (await db.query.meetings.findMany({ orderBy: [asc(schema.meetings.date), asc(schema.meetings.start)], with: { company: { columns: { id: true, name: true } } } })).filter((r) => r.date >= t).slice(0, 6);
  const dayList = inMonth.filter((r) => r.date === day);
  const count = (d: string) => inMonth.filter((r) => r.date === d).length;
  const companies = (await companyOptions());
  const dayLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"));
  const join = (r: (typeof inMonth)[number]) => {
    const loc = r.location.trim();
    if (!loc) return null;
    if (/^https?:\/\//.test(loc)) return { href: loc, external: true };
    if (r.mode === "Téléphone") return { href: `tel:${loc.replace(/\s/g, "")}`, external: false };
    return { href: `https://www.openstreetmap.org/search?query=${encodeURIComponent(loc)}`, external: true };
  };
  return (
    <>
      <PageHeader
        title="Rendez-vous"
        subtitle="Clique un jour pour voir ses rendez-vous. L'export ICS les ajoute à ton agenda (Calendrier, Google, Outlook)."
        actions={
          <>
            <a href="/api/exports/agenda" className="btn btn-sec">
              <Icon name="download" />
              Exporter l&apos;agenda (.ics)
            </a>
            <FormButton form="meeting" label="Créer un rendez-vous" primary companies={companies} preset={{ date: day, ...(sp.co ? { companyId: sp.co } : {}) }} autoOpen={sp.new === "1"} />
          </>
        }
      />
      <section className="flex flex-wrap items-start gap-4">
        <article className="card rise flex flex-[1_1_340px] flex-col gap-3.5 p-5">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/rdv?m=${prev}`} className="btn btn-ghost btn-sm" aria-label="Mois précédent">
              <Icon name="chevL" />
            </Link>
            <h2 className="text-sm font-medium">
              {MONTHS[m - 1]} {y}
            </h2>
            <Link href={`/rdv?m=${next}`} className="btn btn-ghost btn-sm" aria-label="Mois suivant">
              <Icon name="chevR" />
            </Link>
          </div>
          <div className="num grid grid-cols-7 justify-items-center gap-y-1.5 text-[13px]">
            {["L", "M", "M", "J", "V", "S", "D"].map((w, i) => (
              <span key={i} className="h-6 text-xs leading-6 text-subtle-fg">
                {w}
              </span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`b${i}`} />
            ))}
            {Array.from({ length: daysIn }, (_, i) => {
              const d = `${month}-${String(i + 1).padStart(2, "0")}`;
              const n = count(d);
              const sel = d === day;
              return (
                <Link
                  key={d}
                  href={`/rdv?m=${month}&d=${d}`}
                  aria-label={`${i + 1} ${MONTHS[m - 1].toLowerCase()}${n ? `, ${n} rendez-vous` : ""}`}
                  aria-current={sel ? "date" : undefined}
                  className={`grid size-[38px] place-items-center rounded-full ${sel ? "bg-primary font-semibold text-primary-fg" : n ? "font-medium shadow-[inset_0_-2px_0_var(--accent)] hover:bg-muted" : d === t ? "outline outline-1 outline-border hover:bg-muted" : "hover:bg-muted"}`}
                >
                  {i + 1}
                </Link>
              );
            })}
          </div>
        </article>
        <article className="card rise flex flex-[1_1_340px] flex-col gap-3 p-5" style={{ animationDelay: "60ms" }}>
          <h2 className="text-sm font-medium first-letter:uppercase">{dayLabel}</h2>
          {dayList.map((r) => {
            const j = join(r);
            return (
              <div key={r.id} className="grid grid-cols-[64px_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-border-subtle py-2.5">
                <span className="num text-[13px] font-semibold">
                  {r.start}
                  <br />
                  <span className="text-xs font-normal text-subtle-fg">{r.end}</span>
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] font-medium">{r.title}</span>
                  {r.company && (
                    <Link href={`/entreprises/${r.company.id}`} className="link text-xs text-muted-fg">
                      {r.company.name}
                    </Link>
                  )}
                  {r.note && <span className="whitespace-pre-line text-xs text-subtle-fg">{r.note}</span>}
                </span>
                {j ? (
                  <a href={j.href} target={j.external ? "_blank" : undefined} rel="noopener noreferrer" className="pill border border-border bg-card text-fg">
                    {r.mode} ›
                  </a>
                ) : (
                  <span className="pill tone-neu">{r.mode}</span>
                )}
                <DeleteButton entity="meeting" id={r.id} label="Supprimer le rendez-vous" />
              </div>
            );
          })}
          {!dayList.length && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Icon name="cal" size={32} />
              <span className="text-sm font-medium">Aucun rendez-vous ce jour-là</span>
              <span className="text-[13px] text-muted-fg">Planifie une relance pour garder le rythme.</span>
            </div>
          )}
          <span className="sec mt-2">À venir</span>
          {upcoming.map((r) => (
            <Link key={r.id} href={`/rdv?m=${r.date.slice(0, 7)}&d=${r.date}`} className="mitem justify-between py-2">
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{r.title}</span>
                <span className="text-xs text-subtle-fg">{r.company?.name ?? r.mode}</span>
              </span>
              <span className="num text-xs text-subtle-fg">
                {fd(r.date).slice(0, 5)} · {r.start}
              </span>
            </Link>
          ))}
          {!upcoming.length && <span className="text-[13px] text-muted-fg">Rien de prévu après le {fd(addDays(t, -1)).slice(0, 5)}.</span>}
        </article>
      </section>
    </>
  );
}
