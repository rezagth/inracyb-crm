"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";
import { createPackQuoteAction } from "@/server/actions/pack-quote";

/** Crée le devis « Pack + Suivi » en brouillon et l'ouvre, prêt à relire puis émettre et envoyer. */
export function PackQuoteButton({ companyId, primary = false }: { companyId: string; primary?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      className={`btn btn-sm ${primary ? "btn-pri" : "btn-sec"}`}
      title="Devis en brouillon : Pack Courrier sécurisé et suivi mensuel, prix pilote s'il reste des places"
      onClick={() =>
        start(async () => {
          const r = await createPackQuoteAction(companyId);
          if (!r.ok) return toast(r.error);
          toast("Devis Pack + Suivi créé : relis-le puis émets-le");
          router.push(`/devis/${r.id}`);
        })
      }
    >
      <Icon name="plus" />
      Devis Pack + Suivi
    </button>
  );
}
