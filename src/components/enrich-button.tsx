"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { completeCompanyAction } from "@/server/actions/enrich";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";

/** Bouton « Compléter la fiche » : Annuaire des Entreprises, montant estimé, puis e-mail et téléphone (site web public). */
export function EnrichButton({ companyId, label = "Compléter la fiche", className = "btn btn-sec" }: { companyId: string; label?: string; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await completeCompanyAction(companyId);
          toast(r.ok ? r.message : r.error);
          router.refresh();
        })
      }
    >
      <Icon name="search" />
      {pending ? "Recherche en cours…" : label}
    </button>
  );
}

/** Complète toutes les entreprises de la liste, une par une (une action serveur par fiche), avec un bouton pour arrêter. */
export function EnrichAll({ ids, label = "Compléter les fiches" }: { ids: string[]; label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(0);
  const stop = useRef(false);
  if (!ids.length) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-sec"
        disabled={pending}
        onClick={() =>
          start(async () => {
            let found = 0;
            let tried = 0;
            const reasons: string[] = [];
            stop.current = false;
            setDone(0);
            for (const id of ids) {
              if (stop.current) break;
              try {
                const r = await completeCompanyAction(id);
                if (r.ok && r.found) found++;
                else reasons.push(r.ok ? r.message : r.error);
              } catch {
                reasons.push("Une fiche n'a pas pu être traitée (délai dépassé ou erreur).");
              }
              tried++;
              setDone(tried);
            }
            // Sans explication, « 0 complétée » ne dit pas quoi corriger : on affiche la première raison rencontrée.
            toast(`${found} entreprise(s) complétée(s) sur ${tried}${stop.current ? " (arrêté)" : ""}${reasons.length ? ` — ${reasons[0]}` : ""}`);
            router.refresh();
          })
        }
      >
        <Icon name="search" />
        {pending ? `Recherche ${done}/${ids.length}…` : `${label} (${ids.length})`}
      </button>
      {pending && (
        <button type="button" className="btn btn-sec" onClick={() => { stop.current = true; }}>
          Arrêter
        </button>
      )}
    </>
  );
}
