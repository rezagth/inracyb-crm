import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany, invoiceTotals } from "@/server/queries";
import { updateCompanyAction } from "@/server/actions/companies";
import { OFFERS, QUOTE_STATUS, statusOfStage } from "@/lib/constants";
import { invoiceDisplayStatus } from "@/lib/billing";
import { eur, fd, fdt, initials, today } from "@/lib/format";
import { Avatar, Badge, Card, EmptyState, PageHeader, toneFor } from "@/components/ui";
import { Icon, type IconName } from "@/components/icon";
import { CompanyForm } from "../company-form";
import { ActivityForm, ContactForm, DeleteCompanyButton, DeleteContactButton, StageSelect, TaskForm } from "./forms";
import { TaskCheck } from "../../taches/task-check";

const TABS = [
  ["activite", "Activité"],
  ["contacts", "Contacts"],
  ["documents", "Devis et factures"],
  ["suivi", "Suivi client"],
  ["taches", "Tâches"],
  ["infos", "Informations"],
] as const;

const EVENT_ICON: Record<string, IconName> = { call: "phone", mail: "mail", note: "note", quote: "file", invoice: "receipt", payment: "bank", stage: "kanban", create: "building", task: "tasks" };

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "activite" } = await searchParams;
  const c = await getCompany(id);
  if (!c) notFound();
  const st = statusOfStage(c.stage);
  const primary = c.contacts.find((x) => x.isPrimary) ?? c.contacts[0];
  const t = today();

  return (
    <>
      <PageHeader
        title={c.name}
        back={{ href: "/entreprises", label: "Entreprises" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            <Badge tone="neu" dot={false}>
              {c.sector}
            </Badge>
            <span className="text-subtle-fg">{OFFERS.find((o) => o.id === c.offer)?.label}</span>
            {primary && (
              <span className="text-subtle-fg">
                · {primary.firstName} {primary.lastName} {primary.role && `(${primary.role})`}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <StageSelect id={c.id} stage={c.stage} />
            <Link href={`/prospection?co=${c.id}&call=1`} className="btn btn-sec">
              <Icon name="phone" />
              Appel guidé
            </Link>
            <Link href={`/rdv?new=1&co=${c.id}`} className="btn btn-sec">
              <Icon name="cal" />
              Rendez-vous
            </Link>
            <Link href={`/prospection?co=${c.id}&tab=mail`} className="btn btn-sec">
              <Icon name="mail" />
              Relance
            </Link>
            <Link href={`/devis/nouveau?co=${c.id}`} className="btn btn-sec">
              <Icon name="file" />
              Devis
            </Link>
            <Link href={`/factures/nouvelle?co=${c.id}`} className="btn btn-pri">
              <Icon name="receipt" />
              Facture
            </Link>
          </>
        }
      />
      <div className="mb-4 flex items-center gap-3">
        <Avatar text={initials(c.name)} tone={toneFor(c.id)} size={40} />
        <nav className="flex gap-5 overflow-x-auto border-b border-border-subtle" aria-label="Sections de la fiche">
          {TABS.map(([k, l]) => (
            <Link
              key={k}
              href={`/entreprises/${c.id}?tab=${k}`}
              aria-current={tab === k ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 pb-2.5 text-[13px] ${tab === k ? "border-fg font-medium text-fg" : "border-transparent text-muted-fg hover:text-fg"}`}
            >
              {l}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "activite" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Card title="Noter un échange" className="p-0">
            <div className="p-5">
              <ActivityForm companyId={c.id} />
            </div>
          </Card>
          <Card title="Historique">
            {c.events.length === 0 ? (
              <EmptyState title="Aucun historique" />
            ) : (
              <ol className="px-5 py-3">
                {c.events.map((e, i) => (
                  <li key={e.id} className="grid grid-cols-[32px_1fr] gap-3">
                    <div className="flex flex-col items-center">
                      <span className="grid size-[30px] place-items-center rounded-full bg-muted text-muted-fg">
                        <Icon name={EVENT_ICON[e.type] ?? "note"} size={14} />
                      </span>
                      {i < c.events.length - 1 && <span className="w-px flex-1 bg-border" />}
                    </div>
                    <div className="flex flex-col gap-0.5 pb-4 pt-1">
                      <span className="whitespace-pre-line text-[13px]">{e.text}</span>
                      <span className="num text-xs text-subtle-fg">{fdt(e.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}

      {tab === "contacts" && (
        <div className="flex flex-col gap-4">
          <Card title="Contacts">
            {c.contacts.length === 0 ? (
              <EmptyState title="Aucun contact" text="Ajoute l'interlocuteur principal ci-dessous." />
            ) : (
              <table className="w-full">
                <tbody>
                  {c.contacts.map((ct) => (
                    <tr key={ct.id} className="tr">
                      <td className="td font-medium">
                        {ct.firstName} {ct.lastName} {ct.isPrimary && <Badge tone="info">Principal</Badge>}
                      </td>
                      <td className="td text-muted-fg">{ct.role || "—"}</td>
                      <td className="td">{ct.email ? <a className="link" href={`mailto:${ct.email}`}>{ct.email}</a> : "—"}</td>
                      <td className="td num">{ct.phone ? <a className="link" href={`tel:${ct.phone.replace(/\s/g, "")}`}>{ct.phone}</a> : "—"}</td>
                      <td className="td text-right">
                        <DeleteContactButton id={ct.id} companyId={c.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Ajouter un contact">
            <div className="p-5">
              <ContactForm companyId={c.id} />
            </div>
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Devis" actions={<Link href={`/devis/nouveau?co=${c.id}`} className="btn btn-sec btn-sm"><Icon name="plus" />Devis</Link>}>
            {c.quotes.length === 0 ? (
              <EmptyState title="Aucun devis" />
            ) : (
              <table className="w-full">
                <tbody>
                  {c.quotes.map((q) => (
                    <tr key={q.id} className="tr">
                      <td className="td whitespace-nowrap font-mono text-xs"><Link className="link" href={`/devis/${q.id}`}>{q.number}</Link></td>
                      <td className="td truncate text-muted-fg">{q.subject}</td>
                      <td className="td num text-right">{eur(q.totalHtCents)}</td>
                      <td className="td"><Badge tone={QUOTE_STATUS[q.status]?.tone ?? "neu"}>{QUOTE_STATUS[q.status]?.label ?? q.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Factures" actions={<Link href={`/factures/nouvelle?co=${c.id}`} className="btn btn-sec btn-sm"><Icon name="plus" />Facture</Link>}>
            {c.invoices.length === 0 ? (
              <EmptyState title="Aucune facture" />
            ) : (
              <table className="w-full">
                <tbody>
                  {c.invoices.map(async (iv) => {
                    const totals = (await invoiceTotals(iv));
                    const ds = invoiceDisplayStatus(iv, totals, t);
                    return (
                      <tr key={iv.id} className="tr">
                        <td className="td whitespace-nowrap font-mono text-xs"><Link className="link" href={`/factures/${iv.id}`}>{iv.number}</Link></td>
                        <td className="td truncate text-muted-fg">{iv.subject}</td>
                        <td className="td num text-right">{eur(totals.ttc)}</td>
                        <td className="td"><Badge tone={ds.tone}>{ds.label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {tab === "suivi" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Rendez-vous et appels" actions={<Link href={`/rdv?new=1&co=${c.id}`} className="btn btn-sec btn-sm"><Icon name="plus" />Rendez-vous</Link>}>
            {c.meetings.length + c.calls.length === 0 ? (
              <EmptyState title="Aucun échange planifié ou noté" />
            ) : (
              <ul>
                {c.meetings.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-2.5 text-[13px] first:border-t-0">
                    <span className="truncate">{m.title}</span>
                    <span className="num text-xs text-subtle-fg">{fd(m.date)} · {m.start} · {m.mode}</span>
                  </li>
                ))}
                {c.calls.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-2.5 text-[13px] first:border-t-0">
                    <span className="truncate">Appel — {k.result}{k.note ? ` · ${k.note}` : ""}</span>
                    <span className="num text-xs text-subtle-fg">{fd(k.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Contrats et missions" actions={<Link href="/contrats" className="btn btn-sec btn-sm">Contrats</Link>}>
            {c.contracts.length + c.missions.length === 0 ? (
              <EmptyState title="Aucun contrat ni mission" />
            ) : (
              <ul>
                {c.contracts.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-2.5 text-[13px] first:border-t-0">
                    <span className="truncate">{k.offer} · {eur(k.monthlyCents)} HT / mois</span>
                    <Badge tone={k.status === "actif" ? "ok" : "neu"}>{k.status === "actif" ? "Actif" : k.status === "brouillon" ? "Brouillon" : "Terminé"}</Badge>
                  </li>
                ))}
                {c.missions.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-2.5 text-[13px] first:border-t-0">
                    <span className="truncate">{m.title}</span>
                    <span className="num text-xs text-subtle-fg">
                      {String(Math.round(m.times.reduce((a, x) => a + x.hours, 0) * 10) / 10).replace(".", ",")} h / {String(m.budgetDays).replace(".", ",")} j · échéance {fd(m.due)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Sécurité" actions={<Link href={`/plans?co=${c.id}`} className="btn btn-sec btn-sm">Plan d&apos;action</Link>}>
            <div className="flex flex-col gap-2 px-5 py-4 text-[13px]">
              <div className="flex justify-between"><span className="text-muted-fg">Plan d&apos;action</span><span className="num">{c.securityActions.filter((a) => a.status === "fait").length} / {c.securityActions.length} actions faites</span></div>
              <div className="flex justify-between"><span className="text-muted-fg">Audits</span><span className="num">{c.audits.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-fg">Tickets ouverts</span><span className="num">{c.tickets.filter((x) => x.status !== "resolu").length}</span></div>
              <div className="flex justify-between"><span className="text-muted-fg">Incidents ouverts</span><span className="num">{c.incidents.filter((x) => x.status !== "clos").length}</span></div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link href={`/plans/comite?co=${c.id}`} className="btn btn-sec btn-sm">Compte rendu de comité</Link>
                {c.audits[0] && <Link href={`/audits/${c.audits[0].id}`} className="btn btn-ghost btn-sm">Dernier audit</Link>}
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === "taches" && (
        <Card title="Tâches liées">
          <div className="border-b border-border-subtle p-5">
            <TaskForm companyId={c.id} />
          </div>
          {c.tasks.length === 0 ? (
            <EmptyState title="Aucune tâche" />
          ) : (
            <ul>
              {c.tasks.map((tk) => (
                <li key={tk.id} className="flex items-center gap-3 border-t border-border-subtle px-5 py-2.5 first:border-t-0">
                  <TaskCheck id={tk.id} done={tk.done} label={tk.title} />
                  <span className={`flex-1 text-[13px] ${tk.done ? "text-subtle-fg line-through" : "font-medium"}`}>{tk.title}</span>
                  <span className={`num text-xs ${!tk.done && tk.dueDate < t ? "text-ko" : "text-subtle-fg"}`}>{fd(tk.dueDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "infos" && (
        <Card className="p-6" title="Informations">
          <div className="p-1 pt-5">
            <CompanyForm action={updateCompanyAction.bind(null, c.id)} company={c} />
          </div>
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
            <span className="text-xs text-subtle-fg">Créée le {fdt(c.createdAt)}</span>
            <DeleteCompanyButton id={c.id} />
          </div>
        </Card>
      )}
    </>
  );
}
