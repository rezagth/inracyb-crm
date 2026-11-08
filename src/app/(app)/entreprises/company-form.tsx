"use client";

import { useActionState } from "react";
import type { Company } from "@/db/schema";
import { OFFERS, PRIORITIES, SECTORS, SOURCES, STAGES } from "@/lib/constants";
import { centsToInput } from "@/lib/format";
import { FormMessage, SubmitButton } from "@/components/form";
import type { ActionResult } from "@/server/core";

type Action = (state: ActionResult | undefined, form: FormData) => Promise<ActionResult>;

export function CompanyForm({ action, company, withContact }: { action: Action; company?: Company; withContact?: boolean }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <label className="label col-span-full">
          Nom de l&apos;entreprise *
          <input className="input" name="name" defaultValue={company?.name} required maxLength={160} placeholder="Ex. Cabinet Dupont" />
        </label>
        <label className="label">
          Secteur
          <select className="input" name="sector" defaultValue={company?.sector ?? "Juridique"}>
            {SECTORS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="label">
          Ville
          <input className="input" name="city" defaultValue={company?.city} maxLength={120} />
        </label>
        <label className="label">
          SIREN
          <input className="input" name="siren" defaultValue={company?.siren} maxLength={20} inputMode="numeric" placeholder="9 chiffres" />
        </label>
        <label className="label col-span-full">
          Adresse de facturation
          <input className="input" name="address" defaultValue={company?.address} maxLength={300} placeholder="N°, rue, code postal (la ville est saisie à part)" />
        </label>
        <label className="label">
          Source
          <select className="input" name="source" defaultValue={company?.source ?? "Site web"}>
            {SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="label">
          Offre visée
          <select className="input" name="offer" defaultValue={company?.offer ?? "Audit"}>
            {OFFERS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Étape
          <select className="input" name="stage" defaultValue={company?.stage ?? "qualif"}>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Priorité
          <select className="input" name="priority" defaultValue={company?.priority ?? "moyenne"}>
            {PRIORITIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Montant estimé (€ HT)
          <input className="input" name="amount" inputMode="decimal" defaultValue={company ? centsToInput(company.amountCents) : ""} placeholder="0" />
        </label>
        <label className="label col-span-full">
          Notes
          <textarea className="input" name="notes" defaultValue={company?.notes} maxLength={5000} />
        </label>
      </div>
      {withContact && (
        <fieldset className="grid gap-4 rounded-xl border border-border-subtle p-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.06em] text-subtle-fg">Contact principal</legend>
          <label className="label">
            Prénom
            <input className="input" name="contactFirstName" maxLength={80} />
          </label>
          <label className="label">
            Nom
            <input className="input" name="contactLastName" maxLength={80} />
          </label>
          <label className="label">
            Fonction
            <input className="input" name="contactRole" maxLength={120} />
          </label>
          <label className="label">
            E-mail
            <input className="input" type="email" name="contactEmail" maxLength={200} />
          </label>
          <label className="label">
            Téléphone
            <input className="input" type="tel" name="contactPhone" maxLength={40} />
          </label>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{company ? "Enregistrer" : "Créer l'entreprise"}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
