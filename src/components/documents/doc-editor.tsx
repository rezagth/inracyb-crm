"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInvoiceAction, saveQuoteAction, type DocInput } from "@/server/actions/documents";
import { UNITS } from "@/lib/constants";
import { computeTotals } from "@/lib/billing";
import { addDays, eur, parseEuroToCents } from "@/lib/format";
import { Icon } from "@/components/icon";

type Line = { key: number; label: string; quantity: string; unit: (typeof UNITS)[number]; unitPrice: string };
type CatalogOpt = { id: string; name: string; unit: string; unitPriceCents: number; description: string; offer: string };

export type DocInitial = {
  companyId: string;
  subject: string;
  issueDate: string;
  dueDate: string;
  discountPct: string;
  note: string;
  lines: { label: string; quantity: number; unit: string; unitPriceCents: number }[];
};

let seq = 0;
const toLine = (l: { label: string; quantity: number; unit: string; unitPriceCents: number }): Line => ({
  key: ++seq,
  label: l.label,
  quantity: String(l.quantity).replace(".", ","),
  unit: (UNITS as readonly string[]).includes(l.unit) ? (l.unit as Line["unit"]) : "forfait",
  unitPrice: (l.unitPriceCents / 100).toFixed(2).replace(".", ",").replace(/,00$/, ""),
});
const emptyLine = (): Line => ({ key: ++seq, label: "", quantity: "1", unit: "forfait", unitPrice: "" });

export function DocEditor({
  kind,
  id,
  companies,
  catalog,
  initial,
  tvaFranchise,
  dueDays,
}: {
  kind: "devis" | "facture";
  id: string | null;
  companies: { id: string; name: string }[];
  catalog: CatalogOpt[];
  initial: DocInitial;
  tvaFranchise: boolean;
  dueDays: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(initial.companyId);
  const [subject, setSubject] = useState(initial.subject);
  const [issueDate, setIssueDate] = useState(initial.issueDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [discountPct, setDiscountPct] = useState(initial.discountPct);
  const [note, setNote] = useState(initial.note);
  const [lines, setLines] = useState<Line[]>(initial.lines.length ? initial.lines.map(toLine) : [emptyLine()]);
  const [pick, setPick] = useState("");

  const totals = useMemo(() => {
    const ls = lines.map((l) => ({ quantity: Number(l.quantity.replace(",", ".")) || 0, unitPriceCents: parseEuroToCents(l.unitPrice) }));
    const bp = Math.round(Math.min(100, Math.max(0, Number(discountPct.replace(",", ".")) || 0)) * 100);
    return computeTotals(ls, bp, tvaFranchise);
  }, [lines, discountPct, tvaFranchise]);

  const set = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function addFromCatalog(itemId: string) {
    const it = catalog.find((c) => c.id === itemId);
    if (!it) return;
    const line = toLine({ label: it.description ? `${it.name} — ${it.description}` : it.name, quantity: 1, unit: it.unit, unitPriceCents: it.unitPriceCents });
    setLines((ls) => (ls.length === 1 && !ls[0].label && !ls[0].unitPrice ? [line] : [...ls, line]));
    setPick("");
  }

  function save(emit: boolean) {
    setError(null);
    if (emit && !confirm(kind === "devis" ? "Émettre le devis ? Il recevra un numéro définitif et ne sera plus modifiable." : "Émettre la facture ? Elle recevra un numéro définitif et ne sera plus modifiable (correction uniquement par avoir).")) return;
    const input: DocInput = {
      companyId,
      subject,
      issueDate,
      dueDate,
      discountPct,
      note,
      lines: lines.map((l) => ({ label: l.label, quantity: l.quantity.replace(",", "."), unit: l.unit, unitPrice: l.unitPrice })),
    };
    start(async () => {
      const r = kind === "devis" ? await saveQuoteAction(id, emit, input) : await saveInvoiceAction(id, emit, input);
      if (!r.ok) return setError(r.error);
      router.push(`/${kind === "devis" ? "devis" : "factures"}/${r.id}`);
      router.refresh();
    });
  }

  const dueLabel = kind === "devis" ? "Valable jusqu'au" : "Échéance";

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="card rise flex flex-col gap-5 p-5">
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          <label className="label">
            Client *
            <select className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
              <option value="">Choisir…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Date d&apos;émission
            <input
              type="date"
              className="input"
              value={issueDate}
              onChange={(e) => {
                setIssueDate(e.target.value);
                if (e.target.value) setDueDate(addDays(e.target.value, dueDays));
              }}
            />
          </label>
          <label className="label">
            {dueLabel}
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="label col-span-full">
            Objet
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} placeholder="Ex. Audit cybersécurité forfaitaire" />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Lignes</h2>
            {catalog.length > 0 && (
              <select className="input h-9 w-auto max-w-full" aria-label="Ajouter une prestation du catalogue" value={pick} onChange={(e) => addFromCatalog(e.target.value)}>
                <option value="">+ Depuis le catalogue…</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {eur(c.unitPriceCents)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <th className="th">Désignation</th>
                  <th className="th w-[84px]">Qté</th>
                  <th className="th w-[110px]">Unité</th>
                  <th className="th w-[120px]">PU HT (€)</th>
                  <th className="th w-[110px] text-right">Total HT</th>
                  <th className="th w-[44px]">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.key}>
                    <td className="td">
                      <textarea rows={1} className="input min-h-9 py-1.5" aria-label={`Désignation ligne ${i + 1}`} value={l.label} maxLength={500} onChange={(e) => set(l.key, { label: e.target.value })} />
                    </td>
                    <td className="td">
                      <input className="input num" inputMode="decimal" aria-label={`Quantité ligne ${i + 1}`} value={l.quantity} onChange={(e) => set(l.key, { quantity: e.target.value })} />
                    </td>
                    <td className="td">
                      <select className="input" aria-label={`Unité ligne ${i + 1}`} value={l.unit} onChange={(e) => set(l.key, { unit: e.target.value as Line["unit"] })}>
                        {UNITS.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    <td className="td">
                      <input className="input num" inputMode="decimal" aria-label={`Prix unitaire ligne ${i + 1}`} value={l.unitPrice} placeholder="0" onChange={(e) => set(l.key, { unitPrice: e.target.value })} />
                    </td>
                    <td className="td num text-right">{eur(Math.round((Number(l.quantity.replace(",", ".")) || 0) * parseEuroToCents(l.unitPrice)))}</td>
                    <td className="td">
                      <button type="button" className="btn btn-ghost btn-sm" aria-label={`Supprimer la ligne ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <button type="button" className="btn btn-sec btn-sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              <Icon name="plus" />
              Ajouter une ligne
            </button>
          </div>
        </div>

        <label className="label">
          Note (conditions, modalités, mentions particulières)
          <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
        </label>
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
        <div className="card rise flex flex-col gap-3 p-5 text-[13px]">
          <div className="flex justify-between">
            <span className="text-muted-fg">Sous-total</span>
            <span className="num">{eur(totals.sub)}</span>
          </div>
          <label className="flex items-center justify-between gap-3">
            <span className="text-muted-fg">Remise (%)</span>
            <input className="input num h-8 w-20 text-right" inputMode="decimal" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
          </label>
          {totals.disc > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-fg">Remise</span>
              <span className="num">−{eur(totals.disc)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-fg">Total HT</span>
            <span className="num">{eur(totals.ht)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-fg">TVA</span>
            <span className="num">{tvaFranchise ? "Non applicable" : eur(totals.tva)}</span>
          </div>
          <div className="flex justify-between border-t border-border-subtle pt-3 text-base font-semibold">
            <span>{tvaFranchise ? "Net à payer" : "Total TTC"}</span>
            <span className="num">{eur(totals.ttc)}</span>
          </div>
          {tvaFranchise && <p className="text-xs text-subtle-fg">TVA non applicable, art. 293 B du CGI (mention ajoutée automatiquement).</p>}
        </div>
        {error && (
          <p role="alert" className="pill tone-ko h-auto whitespace-normal px-3 py-2">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button type="button" className="btn btn-sec" disabled={pending} onClick={() => save(false)}>
            {pending ? "Enregistrement…" : "Enregistrer le brouillon"}
          </button>
          <button type="button" className="btn btn-pri" disabled={pending} onClick={() => save(true)}>
            <Icon name="check" />
            {kind === "devis" ? "Émettre le devis" : "Émettre la facture"}
          </button>
          <p className="text-xs text-subtle-fg">Le numéro définitif est attribué à l&apos;émission. Ensuite le document ne se modifie plus.</p>
        </div>
      </aside>
    </div>
  );
}
