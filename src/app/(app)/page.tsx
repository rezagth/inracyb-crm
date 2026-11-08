import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dashboardData } from "@/server/queries";
import { eur, fd, fdt, today } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Icon } from "@/components/icon";
import { TaskCheck } from "./taches/task-check";

export const metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  const d = await dashboardData();
  if (!d.settings.onboardedAt) redirect("/bienvenue");
  const count = async (tbl: typeof schema.calls | typeof schema.companies | typeof schema.mailSends | typeof schema.tasks | typeof schema.meetings) => (await db.select({ c: sql<number>`count(*)::int` }).from(tbl).limit(1))[0]?.c ?? 0;
  const checklist = [
    { l: "Compléter ton profil", s: "Nom et téléphone signent tes scripts et tes mails.", done: !!d.settings.legalName && !!d.settings.phone, href: "/bienvenue", cta: "Compléter" },
    { l: "Ajouter ton premier vrai prospect", s: "Une entreprise que tu veux appeler cette semaine.", done: (await count(schema.companies)) > 0, href: "/entreprises/nouvelle", cta: "Ajouter" },
    { l: "Passer ton premier appel guidé", s: "Le script pas à pas, les objections à portée de main.", done: (await count(schema.calls)) > 0, href: "/prospection?call=1", cta: "Appeler" },
    { l: "Envoyer ton premier mail", s: "Séquence J0 à J+14, relances planifiées toutes seules.", done: (await count(schema.mailSends)) > 0, href: "/prospection?tab=mail", cta: "Écrire" },
    { l: "Planifier une relance", s: "Pour ne laisser filer personne.", done: (await count(schema.tasks)) > 0, href: "/taches", cta: "Planifier" },
    { l: "Décrocher ton premier rendez-vous", s: "Le seul chiffre qui compte vraiment.", done: (await count(schema.meetings)) > 0, href: "/rdv?new=1", cta: "Planifier" },
  ];
  const ckDone = checklist.filter((k) => k.done).length;
  const t = today();
  const max = Math.max(1, ...d.months.map((m) => m.cents));
  const s = d.settings;
  const ceilingPct = s.caCeilingCents ? Math.round((d.cashYear / s.caCeilingCents) * 100) : 0;
  const goalPct = s.goalCaCents ? Math.round((d.cashYear / s.goalCaCents) * 100) : null;
  const dateLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date());

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        actions={
          <>
            <Link href="/entreprises/nouvelle" className="btn btn-sec">
              <Icon name="plus" />
              Prospect
            </Link>
            <Link href="/factures/nouvelle" className="btn btn-pri">
              <Icon name="plus" />
              Facture
            </Link>
          </>
        }
      />
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        <StatCard icon="users" label="Affaires ouvertes" value={String(d.openDeals.length)} sub={`${eur(d.pipelineCents, { round: true })} en jeu`} href="/pipeline" />
        <StatCard icon="file" label="Devis en attente" value={String(d.quotesSent)} sub="envoyés, sans réponse" href="/devis" />
        <StatCard icon="receipt" label="À encaisser" value={eur(d.dueCents, { round: true })} sub={d.late.length ? `${d.late.length} facture(s) en retard` : "Aucun retard"} tone={d.late.length ? "ko" : undefined} href="/factures" />
        <StatCard icon="bank" label="Encaissé cette année" value={eur(d.cashYear, { round: true })} sub={goalPct !== null ? `${goalPct} % de l'objectif` : `${eur(d.cashMonth, { round: true })} ce mois-ci`} href="/factures" />
      </div>

      {ckDone < checklist.length && (
        <section className="card rise mt-4 flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Bien démarrer</h2>
            <span className="num text-xs text-subtle-fg">
              {ckDone} / {checklist.length} étapes
            </span>
          </div>
          <span className="block h-1.5 rounded-full bg-muted">
            <span className="block h-full rounded-full bg-ok" style={{ width: `${Math.round((ckDone / checklist.length) * 100)}%`, background: "var(--ok-fg)" }} />
          </span>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            {checklist.map((k) => (
              <div key={k.l} className={`flex items-start gap-3 rounded-lg border border-border-subtle p-3 ${k.done ? "bg-muted" : ""}`}>
                <span className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded border ${k.done ? "border-primary bg-primary text-primary-fg" : "border-border bg-card"}`}>{k.done && <Icon name="check" size={12} />}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={`text-[13px] font-medium ${k.done ? "text-subtle-fg line-through" : ""}`}>{k.l}</span>
                  <span className="text-xs text-subtle-fg">{k.s}</span>
                </span>
                {!k.done && (
                  <Link href={k.href} className="btn btn-sec btn-sm">
                    {k.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="Encaissements des 6 derniers mois">
          <div className="flex h-[220px] items-end gap-3 px-5 pb-3 pt-6">
            {d.months.map((m) => (
              <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="num text-[11px] text-subtle-fg">{m.cents ? eur(m.cents, { round: true }) : ""}</span>
                <div
                  className="w-full max-w-[44px] rounded-t-md border-t-2 border-accent bg-accent-soft"
                  style={{ height: `${Math.max(2, (m.cents / max) * 160)}px` }}
                  title={`${m.label} : ${eur(m.cents)}`}
                />
                <span className="text-xs capitalize text-subtle-fg">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t border-border-subtle px-5 py-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-muted-fg">Plafond micro-entreprise utilisé</span>
              <span className="num font-medium">
                {ceilingPct} % de {eur(s.caCeilingCents, { round: true })}
              </span>
            </div>
            <span className="block h-1.5 rounded-full bg-muted">
              <span className={`block h-full rounded-full ${ceilingPct > 80 ? "bg-ko" : "bg-ok"}`} style={{ width: `${Math.min(100, ceilingPct)}%` }} />
            </span>
          </div>
        </Card>

        <Card title="À faire aujourd'hui" actions={<Link href="/taches" className="text-[13px] text-muted-fg hover:text-fg">Tout voir ›</Link>}>
          {d.tasksToday.length === 0 ? (
            <EmptyState title="Rien en attente" text="Aucune tâche pour aujourd'hui ni en retard." />
          ) : (
            <ul className="flex flex-col">
              {d.tasksToday.map((tk) => (
                <li key={tk.id} className="flex items-start gap-3 border-t border-border-subtle px-5 py-2.5 first:border-t-0">
                  <TaskCheck id={tk.id} done={tk.done} label={tk.title} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13px] font-medium">{tk.title}</span>
                    <span className="text-xs text-subtle-fg">
                      {tk.company ? (
                        <Link href={`/entreprises/${tk.company.id}`} className="link">
                          {tk.company.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </span>
                  </span>
                  {tk.dueDate < t ? <Badge tone="ko">Retard</Badge> : <Badge tone="info">Aujourd&apos;hui</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Factures en retard">
          {d.late.length === 0 ? (
            <EmptyState title="Aucune facture en retard" text="Tous tes clients sont à jour." />
          ) : (
            <table className="w-full">
              <tbody>
                {d.late.map((i) => (
                  <tr key={i.id} className="tr">
                    <td className="td whitespace-nowrap font-mono text-xs">
                      <Link href={`/factures/${i.id}`} className="link">
                        {i.number}
                      </Link>
                    </td>
                    <td className="td">{i.company.name}</td>
                    <td className="td num text-right">{eur(i.totals.rest)}</td>
                    <td className="td text-xs text-ko">échue le {fd(i.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Activité récente">
          {d.recent.length === 0 ? (
            <EmptyState title="Pas encore d'activité" />
          ) : (
            <ul>
              {d.recent.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 border-t border-border-subtle px-5 py-2.5 text-[13px] first:border-t-0">
                  <span className="min-w-0">
                    {e.company && (
                      <Link href={`/entreprises/${e.company.id}`} className="link mr-1 font-medium">
                        {e.company.name}
                      </Link>
                    )}
                    <span className="text-muted-fg">{e.text}</span>
                  </span>
                  <span className="num shrink-0 text-xs text-subtle-fg">{fdt(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
