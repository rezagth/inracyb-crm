import type { Settings } from "@/db/schema";
import type { Totals } from "@/lib/billing";
import { isDraftNumber } from "@/lib/billing";
import { eur, fd, fdt, num } from "@/lib/format";

type SheetProps = {
  kind: "devis" | "facture" | "avoir";
  number: string;
  issueDate: string;
  dueDate: string;
  subject: string;
  note: string;
  discountBp: number;
  lines: { id: string; label: string; quantity: number; unit: string; unitPriceCents: number }[];
  totals: Totals;
  company: { name: string; address: string; city: string; siren: string; contacts: { firstName: string; lastName: string; role: string; email: string }[] };
  settings: Settings;
  signedBy?: string | null;
  signedAt?: Date | null;
  creditFor?: string | null;
  quoteNumber?: string | null;
};

/** Document imprimable (devis, facture, avoir) avec les mentions obligatoires. */
export function DocSheet(p: SheetProps) {
  const s = p.settings;
  const draft = isDraftNumber(p.number);
  const title = p.kind === "devis" ? "Devis" : p.kind === "avoir" ? "Avoir" : "Facture";
  const contact = p.company.contacts[0];
  const missing = [!s.legalName && "nom légal", !s.siret && "SIRET", !s.address && "adresse"].filter(Boolean) as string[];

  return (
    <article className="printable card rise mx-auto w-full max-w-[820px] p-8 text-[13px] leading-relaxed sm:p-10" aria-label={`${title} ${p.number}`}>
      {draft && (
        <p className="no-print pill tone-warn mb-6 h-auto whitespace-normal px-3 py-1.5">Brouillon : numéro provisoire, sans valeur légale tant qu&apos;il n&apos;est pas émis.</p>
      )}
      {missing.length > 0 && (
        <p className="no-print pill tone-ko mb-6 h-auto whitespace-normal px-3 py-1.5">Mentions manquantes dans Paramètres : {missing.join(", ")}. Complète-les avant d&apos;envoyer ce document.</p>
      )}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-lg font-semibold tracking-tight">{s.tradeName}</span>
          {s.legalName && <span>{s.legalName} — EI</span>}
          {s.address && <span className="whitespace-pre-line text-muted-fg">{s.address}</span>}
          {s.siret && <span className="text-muted-fg">SIRET {s.siret}</span>}
          {s.email && <span className="text-muted-fg">{s.email}</span>}
          {s.phone && <span className="text-muted-fg">{s.phone}</span>}
          {s.website && <span className="text-muted-fg">{s.website}</span>}
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="text-2xl font-semibold tracking-tight">{title}</span>
          <span className="num font-mono">{draft ? "Brouillon" : `N° ${p.number}`}</span>
          <span className="text-muted-fg">Date : {fd(p.issueDate)}</span>
          {p.kind === "devis" && <span className="text-muted-fg">Valable jusqu&apos;au {fd(p.dueDate)}</span>}
          {p.kind === "facture" && <span className="text-muted-fg">Échéance : {fd(p.dueDate)}</span>}
          {p.quoteNumber && <span className="text-muted-fg">Réf. devis {p.quoteNumber}</span>}
          {p.creditFor && <span className="text-muted-fg">Annule la facture {p.creditFor}</span>}
        </div>
      </header>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-subtle-fg">Objet</p>
          <p className="mt-1">{p.subject}</p>
        </div>
        <div className="rounded-lg border border-border-subtle p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-subtle-fg">Client</p>
          <p className="mt-1 font-medium">{p.company.name}</p>
          {p.company.address && <p className="whitespace-pre-line">{p.company.address}</p>}
          {p.company.city && <p>{p.company.city}</p>}
          {p.company.siren && <p className="text-muted-fg">SIREN {p.company.siren}</p>}
          {contact && (
            <p className="text-muted-fg">
              À l&apos;attention de {contact.firstName} {contact.lastName}
              {contact.role ? `, ${contact.role}` : ""}
            </p>
          )}
          {!p.company.address && <p className="no-print mt-1 text-xs text-ko">Adresse du client manquante (onglet Informations de la fiche).</p>}
        </div>
      </section>

      <table className="mt-8 w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 pr-3 text-left text-xs font-medium text-subtle-fg">Désignation</th>
            <th className="py-2 pr-3 text-right text-xs font-medium text-subtle-fg">Qté</th>
            <th className="py-2 pr-3 text-left text-xs font-medium text-subtle-fg">Unité</th>
            <th className="py-2 pr-3 text-right text-xs font-medium text-subtle-fg">PU HT</th>
            <th className="py-2 text-right text-xs font-medium text-subtle-fg">Total HT</th>
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l) => (
            <tr key={l.id} className="border-b border-border-subtle align-top">
              <td className="whitespace-pre-line py-2.5 pr-3">{l.label}</td>
              <td className="num py-2.5 pr-3 text-right">{num(l.quantity)}</td>
              <td className="py-2.5 pr-3">{l.unit}</td>
              <td className="num py-2.5 pr-3 text-right">{eur(l.unitPriceCents)}</td>
              <td className="num py-2.5 text-right">{eur(Math.round(l.quantity * l.unitPriceCents))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto flex w-full max-w-[300px] flex-col gap-1.5">
        {p.totals.disc !== 0 && (
          <>
            <Row label="Sous-total HT" value={eur(p.totals.sub)} />
            <Row label={`Remise ${num(p.discountBp / 100)} %`} value={`−${eur(p.totals.disc)}`} />
          </>
        )}
        <Row label="Total HT" value={eur(p.totals.ht)} />
        <Row label={s.tvaFranchise ? "TVA" : "TVA 20 %"} value={s.tvaFranchise ? "—" : eur(p.totals.tva)} />
        <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
          <span>{p.kind === "avoir" ? "Total de l'avoir" : s.tvaFranchise ? "Net à payer" : "Total TTC"}</span>
          <span className="num">{eur(p.totals.ttc)}</span>
        </div>
        {p.kind === "facture" && p.totals.paid > 0 && (
          <>
            <Row label="Déjà réglé" value={`−${eur(p.totals.paid)}`} />
            <Row label="Reste dû" value={eur(p.totals.rest)} strong />
          </>
        )}
      </div>

      {p.note && <p className="mt-8 whitespace-pre-line rounded-lg bg-muted p-4">{p.note}</p>}

      <footer className="mt-8 flex flex-col gap-1 border-t border-border-subtle pt-4 text-xs text-muted-fg">
        {s.tvaFranchise && <p>TVA non applicable, art. 293 B du CGI.</p>}
        {p.kind === "facture" && (
          <>
            <p>
              Paiement à réception, au plus tard le {fd(p.dueDate)}, par {s.payMethod.toLowerCase()}.{s.iban ? ` IBAN : ${s.iban}.` : ""}
              {s.payLink ? ` Paiement en ligne : ${s.payLink}` : ""}
            </p>
            <p>Pas d&apos;escompte pour paiement anticipé.</p>
            <p>
              En cas de retard de paiement : pénalités au taux de {s.latePenalty}, exigibles dès le lendemain de l&apos;échéance, et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce).
            </p>
          </>
        )}
        {p.kind === "devis" && (
          <>
            <p>Devis gratuit, valable jusqu&apos;au {fd(p.dueDate)}. Conditions de paiement : {s.payDays} jours à réception de facture.</p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div className="min-h-[90px] rounded-lg border border-dashed border-border p-3">
                <p className="font-medium text-fg">Bon pour accord</p>
                {p.signedBy ? (
                  <p className="mt-1">
                    Accepté par {p.signedBy}
                    {p.signedAt ? ` le ${fdt(p.signedAt)}` : ""}
                  </p>
                ) : (
                  <p className="mt-1">Date, nom, fonction et signature du client, précédés de la mention « Bon pour accord ».</p>
                )}
              </div>
              <div className="min-h-[90px] rounded-lg border border-dashed border-border p-3">
                <p className="font-medium text-fg">{s.tradeName}</p>
              </div>
            </div>
          </>
        )}
        {s.legalForm && <p className="mt-2">{s.legalForm}{s.siret ? ` · SIRET ${s.siret}` : ""}</p>}
      </footer>
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
      <span className="text-muted-fg">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
