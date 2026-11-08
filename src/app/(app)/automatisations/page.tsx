import { db, schema } from "@/db";
import { PageHeader } from "@/components/ui";
import { Icon, type IconName } from "@/components/icon";
import { ModTip } from "@/components/mod/layout";
import { RunButton } from "@/components/mod/cells";
import { runAutomationsNowAction, toggleAutomationAction } from "@/server/actions/finance";
import { AutoSwitch } from "./switch";

export const metadata = { title: "Automatisations" };

const AUTO: [string, IconName, string, string, boolean][] = [
  ["acompte", "p_devis", "Un devis passe en « Accepté »", "Créer une facture d'acompte de 30 % en brouillon", false],
  ["solde", "p_missions", "Une mission passe en « Livrée »", "Créer une tâche « facturer le solde » pour aujourd'hui", false],
  ["contrats", "p_contrats", "Un nouveau mois commence", "Créer en brouillon les factures de tous les contrats actifs", true],
  ["retard", "p_factures", "Une facture dépasse son échéance", "Créer une tâche de relance de paiement (puis utilise les 3 niveaux de relance de la facture)", true],
  ["ticket", "p_support", "Un ticket de priorité haute est ouvert", "Créer une tâche urgente pour aujourd'hui", false],
  ["prospectJ0", "p_contacts", "Tu ajoutes un nouveau prospect", "Créer la tâche « envoyer le mail J0 » pour aujourd'hui", false],
  ["rdvPrep", "p_rdv", "Un rendez-vous est planifié", "Créer une tâche « préparer le RDV » la veille", false],
  ["fiscal", "p_tresorerie", "Une échéance URSSAF approche, ou ton CA se rapproche du plafond ou du seuil de TVA", "Créer une tâche de rappel (déclaration, plafond à 80/90/100 %, franchise de TVA)", true],
];

export default async function AutomationsPage() {
  const rows = Object.fromEntries((await db.select().from(schema.automations)).map((r) => [r.key, r]));
  return (
    <>
      <PageHeader title="Automatisations" actions={<RunButton action={runAutomationsNowAction} label="Exécuter maintenant" primary small={false} />} />
      <div className="flex flex-col gap-4">
        <ModTip>Les automatisations font le travail répétitif à ta place : créer des factures, des tâches et des relances au bon moment. La facturation des contrats et les relances d&apos;impayés tournent aussi toutes seules, une fois par jour, à l&apos;ouverture du CRM.</ModTip>
        <section className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
          {AUTO.map(([key, icon, when, then, canRun], i) => {
            const r = rows[key];
            const on = r?.enabled ?? true;
            return (
              <article key={key} className={`card rise flex flex-col gap-2.5 p-5 ${on ? "" : "opacity-70"}`} style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-fg">
                    <Icon name={icon} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="sec">Quand</span>
                    <strong className="text-[13px]">{when}</strong>
                    <span className="sec mt-1.5">Alors</span>
                    <span className="text-[13px]">{then}</span>
                  </div>
                  <AutoSwitch on={on} label={then} action={toggleAutomationAction.bind(null, key)} />
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2.5 text-xs text-subtle-fg">
                  <span>{on ? (r?.runs ? `Déclenchée ${r.runs} fois` : "Active · pas encore déclenchée") : "Désactivée"}</span>
                  {canRun && on && <span>Passage automatique quotidien</span>}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </>
  );
}
