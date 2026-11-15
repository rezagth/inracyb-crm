import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuote } from "@/server/queries";
import { getSettings } from "@/server/core";
import { buildContract } from "@/lib/contract-template";
import { fd } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/documents/print-button";
import { ContractTrace } from "./trace";

export const metadata = { title: "Contrat de mission" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || "";

/** Contrat de mission + annexe RGPD (art. 28) généré depuis un devis : tout vient du CRM, sauf les champs du formulaire ci-dessous. */
export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const q = await getQuote(id);
  if (!q) notFound();
  const s = await getSettings();
  const contact = q.company.contacts[0];
  const days = Number(one(sp.days));
  const start = one(sp.start);
  const doc = buildContract({
    clientName: q.company.name,
    clientSignatoryName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
    clientSignatoryRole: contact?.role || null,
    clientSiret: q.company.siren || null,
    clientAddress: [q.company.address, q.company.city].filter(Boolean).join(", ") || null,
    priceHT: q.totals.ht / 100,
    durationDays: Number.isInteger(days) && days > 0 ? days : null,
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : null,
    scope: one(sp.scope) || [q.subject, ...q.lines.map((l) => l.label)].filter(Boolean).join(" — ") || null,
    provider: {
      legalName: s.legalName ? `${s.legalName} (${s.legalForm})` : null,
      representative: s.legalName || null,
      siret: s.siret || null,
      address: s.address || null,
      email: s.email || null,
      insurer: one(sp.insurer) || null,
    },
    payDays: s.payDays,
    payMethod: s.payMethod,
    latePenalty: s.latePenalty,
    tvaFranchise: s.tvaFranchise,
  });
  const mailto = contact?.email
    ? `mailto:${contact.email}?subject=${encodeURIComponent(`Contrat de mission — ${q.company.name}`)}&body=${encodeURIComponent(
        `Bonjour ${contact.firstName},\n\nVeuillez trouver ci-joint le contrat de mission (réf. ${doc.reference}) et son annexe de protection des données, à nous retourner signés.\n\nCordialement,\n${s.legalName || s.tradeName}`,
      )}`
    : null;

  return (
    <>
      <PageHeader title="Contrat de mission" back={{ href: `/devis/${id}`, label: "Devis" }} subtitle={<Link className="link" href={`/entreprises/${q.companyId}`}>{q.company.name}</Link>} actions={<PrintButton />} />
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <article className="printable card mx-auto w-full max-w-[820px] p-8 text-[13px] leading-relaxed sm:p-10" aria-label="Contrat de mission">
          {doc.missing.length > 0 && (
            <p className="no-print pill tone-warn mb-6 h-auto whitespace-normal px-3 py-1.5">À compléter avant envoi : {doc.missing.join(", ")}. (Identité et paiement : Paramètres ; client : fiche entreprise ; le reste : formulaire à droite.)</p>
          )}
          <h1 className="text-lg font-semibold">{doc.title}</h1>
          <p className="italic">Réf. {doc.reference}</p>
          {doc.articles.map((a) => (
            <section key={a.title} className="mt-4"><h2 className="font-semibold">{a.title}</h2>{a.paragraphs.map((p, i) => <p key={i} className="mt-1">{p}</p>)}</section>
          ))}
          <hr className="my-6" />
          <h1 className="text-base font-semibold">{doc.annex.title}</h1>
          <p>{doc.annex.intro}</p>
          {doc.annex.articles.map((a) => (
            <section key={a.title} className="mt-4"><h2 className="font-semibold">{a.title}</h2>{a.paragraphs.map((p, i) => <p key={i} className="mt-1">{p}</p>)}</section>
          ))}
        </article>
        <aside className="no-print flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
          <form method="get" className="card flex flex-col gap-2 p-5 text-[13px]">
            <h2 className="text-sm font-medium">Champs de la mission</h2>
            <label>Date de démarrage<input className="input mt-1" type="date" name="start" defaultValue={start} /></label>
            <label>Durée (jours)<input className="input mt-1" inputMode="numeric" name="days" defaultValue={one(sp.days) || "5"} /></label>
            <label>Assureur RC pro<input className="input mt-1" name="insurer" defaultValue={one(sp.insurer)} /></label>
            <label>Périmètre (sinon : objet et lignes du devis)<textarea className="input mt-1" rows={3} name="scope" defaultValue={one(sp.scope)} /></label>
            <button className="btn btn-sec" type="submit">Actualiser</button>
          </form>
          <div className="card flex flex-col gap-3 p-5">
            <h2 className="text-sm font-medium">Envoi</h2>
            <p className="text-xs text-muted-fg">Imprime en PDF, puis joins-le à l&apos;e-mail (comme pour le devis).{doc.missing.length > 0 ? " Complète d'abord les champs manquants." : ""}</p>
            {mailto && <a className="btn btn-sec" href={mailto}>Préparer l&apos;e-mail d&apos;envoi</a>}
            <ContractTrace quoteId={id} reference={doc.reference} disabled={doc.missing.length > 0} />
          </div>
          <p className="text-xs text-muted-fg">Début {fd(start || null)} · modèle à faire relire par un juriste avant la première signature.</p>
        </aside>
      </div>
    </>
  );
}
