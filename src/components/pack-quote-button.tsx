"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";
import { OFFER_KEYS, OFFER_LABEL, OFFER_WHY, type OfferKey } from "@/lib/pack-quote";
import { createOfferQuoteAction } from "@/server/actions/pack-quote";

/**
 * Devis en un clic : l'offre recommandée en bouton, les autres dans un menu. Crée le devis en brouillon et l'ouvre,
 * prêt à relire puis émettre et envoyer.
 */
export function PackQuoteButton({ companyId, offers = OFFER_KEYS, primary = false }: { companyId: string; offers?: readonly OfferKey[]; primary?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const go = (key: OfferKey) =>
    start(async () => {
      const r = await createOfferQuoteAction(companyId, key);
      if (!r.ok) return toast(r.error);
      toast(`Devis « ${OFFER_LABEL[key]} » créé : relis-le puis émets-le`);
      router.push(`/devis/${r.id}`);
    });
  const [first, ...rest] = offers.length ? offers : OFFER_KEYS;
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" disabled={pending} className={`btn btn-sm ${primary ? "btn-pri" : "btn-sec"}`} title={`Recommandé : ${OFFER_WHY[first]}`} onClick={() => go(first)}>
        <Icon name="plus" />
        Devis {OFFER_LABEL[first]}
      </button>
      {rest.length > 0 && (
        <select
          className="input text-[13px]"
          disabled={pending}
          value=""
          aria-label="Autre offre"
          onChange={(e) => e.target.value && go(e.target.value as OfferKey)}
        >
          <option value="">Autre offre…</option>
          {rest.map((k) => (
            <option key={k} value={k}>
              {OFFER_LABEL[k]}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}
