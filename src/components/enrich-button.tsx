"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { enrichCompanyAction } from "@/server/actions/enrich";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";

/** Bouton « Chercher l'e-mail et le téléphone » d'une entreprise (lit son site web public). */
export function EnrichButton({ companyId, label = "Chercher e-mail et téléphone", className = "btn btn-sec" }: { companyId: string; label?: string; className?: string }) {
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
          const r = await enrichCompanyAction(companyId);
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

/** Lance la recherche sur plusieurs entreprises, une par une (10 au plus par clic). */
export function EnrichAll({ ids }: { ids: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(0);
  const batch = ids.slice(0, 10);
  if (!batch.length) return null;
  return (
    <button
      type="button"
      className="btn btn-sec"
      disabled={pending}
      onClick={() =>
        start(async () => {
          let found = 0;
          setDone(0);
          for (const id of batch) {
            const r = await enrichCompanyAction(id);
            if (r.ok && r.found) found++;
            setDone((n) => n + 1);
          }
          toast(`${found} entreprise(s) complétée(s) sur ${batch.length} cherchée(s)`);
          router.refresh();
        })
      }
    >
      <Icon name="search" />
      {pending ? `Recherche ${done}/${batch.length}…` : `Trouver les e-mails manquants (${Math.min(ids.length, 10)})`}
    </button>
  );
}
