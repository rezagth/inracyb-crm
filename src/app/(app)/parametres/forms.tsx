"use client";

import { useActionState } from "react";
import type { Settings } from "@/db/schema";
import { changePasswordAction, updateSettingsAction } from "@/server/actions/settings";
import { revokeAllSessions } from "@/app/(auth)/actions";
import { centsToInput } from "@/lib/format";
import { FormMessage, SubmitButton } from "@/components/form";

function Field({ label, name, def, hint, ...rest }: { label: string; name: string; def?: string | number; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="label">
      {label}
      <input className="input" name={name} defaultValue={def} {...rest} />
      {hint && <span className="text-xs font-normal text-subtle-fg">{hint}</span>}
    </label>
  );
}

function Section({ title, children, note, id }: { title: string; children: React.ReactNode; note?: string; id?: string }) {
  return (
    <fieldset id={id} className="flex scroll-mt-20 flex-col gap-3 border-t border-border-subtle pt-5 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <h2 className="text-sm font-medium">{title}</h2>
      {note && <p className="-mt-1 text-xs text-subtle-fg">{note}</p>}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">{children}</div>
    </fieldset>
  );
}

export function SettingsForm({ s }: { s: Settings }) {
  const [state, action] = useActionState(updateSettingsAction, undefined);
  const money = (c: number) => centsToInput(c).replace(".", ",");
  return (
    <form action={action} className="flex flex-col gap-6">
      <Section title="Identité" note="Ces informations apparaissent sur tes devis et factures (mentions obligatoires).">
        <Field label="Nom commercial *" name="tradeName" def={s.tradeName} required maxLength={120} />
        <Field label="Nom et prénom (entrepreneur)" name="legalName" def={s.legalName} maxLength={120} hint="Suivi de « EI » sur les documents." />
        <Field label="Statut juridique" name="legalForm" def={s.legalForm} maxLength={160} />
        <Field label="SIRET" name="siret" def={s.siret} maxLength={20} inputMode="numeric" />
        <label className="label col-span-full">
          Adresse
          <textarea className="input min-h-[64px]" name="address" defaultValue={s.address} maxLength={300} />
        </label>
        <Field label="E-mail" name="email" type="email" def={s.email} maxLength={200} />
        <Field label="Téléphone" name="phone" def={s.phone} maxLength={40} />
        <Field label="Site web" name="website" def={s.website} maxLength={200} />
      </Section>

      <Section id="profil" title="Profil de prospection" note="Ces informations remplissent tes scripts d'appel, tes mails et tes réponses aux objections.">
        <Field label="Marque pour l'IA" name="iaBrand" def={s.iaBrand} maxLength={120} />
        <Field label="Ville" name="city" def={s.city} maxLength={120} />
        <Field label="Prix de l'audit forfaitaire (€ HT)" name="prixAudit" def={money(s.prixAuditCents)} inputMode="decimal" hint="Remplace [PRIX] dans tes scripts." />
        <div className="label col-span-full">
          Offres actives
          <div className="flex flex-wrap gap-4 font-normal">
            {(
              [
                ["audit", "Audit forfaitaire"],
                ["ciso", "RSSI externalisé"],
                ["ia", "Automatisation IA"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="offers" value={k} defaultChecked={s.offers.split(",").includes(k)} className="size-4" />
                {l}
              </label>
            ))}
          </div>
        </div>
        <div className="label col-span-full">
          Secteurs cibles (appelés en premier)
          <div className="flex flex-wrap gap-4 font-normal">
            {["Juridique", "Notariat", "Santé", "Expertise comptable", "Immobilier", "Autres"].map((k) => (
              <label key={k} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="targetSectors" value={k} defaultChecked={s.targetSectors.split(",").includes(k)} className="size-4" />
                {k}
              </label>
            ))}
          </div>
        </div>
        <Field label="Objectif d'appels par jour" name="goalCalls" type="number" min={0} def={s.goalCalls} />
        <Field label="Objectif de mails par jour" name="goalMails" type="number" min={0} def={s.goalMails} />
        <Field label="Objectif de RDV par semaine" name="goalRdv" type="number" min={0} def={s.goalRdv} />
      </Section>

      <Section title="Paiement">
        <Field label="IBAN" name="iban" def={s.iban} maxLength={50} />
        <Field label="Lien de paiement en ligne" name="payLink" def={s.payLink} maxLength={300} placeholder="https://…" />
        <Field label="Lien de prise de rendez-vous" name="calUrl" def={s.calUrl} maxLength={300} placeholder="https://…" />
        <Field label="Moyen de paiement par défaut" name="payMethod" def={s.payMethod} maxLength={80} />
        <Field label="Délai de paiement (jours)" name="payDays" type="number" min={0} max={60} def={s.payDays} hint="60 jours maximum entre professionnels." />
        <Field label="Taux des pénalités de retard" name="latePenalty" def={s.latePenalty} maxLength={200} />
      </Section>

      <Section title="Régime fiscal et social" note="Valeurs par défaut à vérifier chaque année sur autoentrepreneur.urssaf.fr et impots.gouv.fr.">
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="tvaFranchise" defaultChecked={s.tvaFranchise} className="size-4" />
          Franchise en base de TVA (art. 293 B du CGI)
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="acre" defaultChecked={s.acre} className="size-4" />
          ACRE en cours
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="vlEnabled" defaultChecked={s.vlEnabled} className="size-4" />
          Versement libératoire de l&apos;impôt
        </label>
        <Field label="Taux de cotisations sociales (%)" name="socialRate" def={String(s.socialRate).replace(".", ",")} inputMode="decimal" />
        <Field label="Réduction ACRE (%)" name="acreRate" def={String(s.acreRate).replace(".", ",")} inputMode="decimal" />
        <Field label="Formation professionnelle CFP (%)" name="cfpRate" def={String(s.cfpRate).replace(".", ",")} inputMode="decimal" />
        <Field label="Versement libératoire (%)" name="vlRate" def={String(s.vlRate).replace(".", ",")} inputMode="decimal" />
        <Field label="Plafond de CA micro (€)" name="caCeiling" def={money(s.caCeilingCents)} inputMode="decimal" />
        <Field label="Seuil de franchise de TVA (€)" name="tvaThreshold" def={money(s.tvaThresholdCents)} inputMode="decimal" />
        <label className="label">
          Déclaration URSSAF
          <select className="input" name="urssafPeriod" defaultValue={s.urssafPeriod}>
            <option value="mensuelle">Mensuelle</option>
            <option value="trimestrielle">Trimestrielle</option>
          </select>
        </label>
        <Field label="Banque" name="bankName" def={s.bankName} maxLength={120} />
      </Section>

      <Section title="Numérotation et objectifs" note="Changer un préfixe n'affecte pas les documents déjà émis. La numérotation reste continue par année.">
        <Field label="Préfixe des factures" name="invoicePrefix" def={s.invoicePrefix} maxLength={8} required />
        <Field label="Préfixe des devis" name="quotePrefix" def={s.quotePrefix} maxLength={8} required />
        <Field label="TJM de référence (€)" name="tjm" def={money(s.tjmCents)} inputMode="decimal" />
        <Field label="Objectif de CA annuel (€)" name="goalCa" def={money(s.goalCaCents)} inputMode="decimal" />
        <Field label="Objectif de MRR (€ / mois)" name="goalMrr" def={money(s.goalMrrCents)} inputMode="decimal" />
        <Field label="Objectif de clients" name="goalClients" type="number" min={0} def={s.goalClients} />
        <Field label="Objectif de revenu net annuel (€)" name="goalNet" def={money(s.goalNetCents)} inputMode="decimal" hint="Sert au prévisionnel de la page Rentabilité." />
        <Field label="Prix moyen d'un audit (€ HT)" name="avgAudit" def={money(s.avgAuditCents)} inputMode="decimal" />
        <Field label="Prix moyen d'un client RSSI (€ / mois)" name="avgRssi" def={money(s.avgRssiCents)} inputMode="decimal" />
      </Section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-5">
        <SubmitButton>Enregistrer les paramètres</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
      <label className="label">
        Mot de passe actuel
        <input className="input" type="password" name="current" required autoComplete="current-password" />
      </label>
      <label className="label">
        Nouveau mot de passe
        <input className="input" type="password" name="next" required minLength={12} autoComplete="new-password" />
      </label>
      <label className="label">
        Confirmation
        <input className="input" type="password" name="confirm" required minLength={12} autoComplete="new-password" />
      </label>
      <div className="col-span-full flex flex-wrap items-center gap-3">
        <SubmitButton className="btn btn-sec">Changer le mot de passe</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function RevokeForm() {
  return (
    <form action={revokeAllSessions}>
      <SubmitButton className="btn btn-danger" pendingText="Déconnexion…">
        Déconnecter tous les appareils
      </SubmitButton>
    </form>
  );
}
