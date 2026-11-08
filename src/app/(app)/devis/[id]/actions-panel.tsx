"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptQuoteAction, deleteDraftAction, emitQuoteAction, invoiceFromQuoteAction, refuseQuoteAction } from "@/server/actions/documents";
import { Icon } from "@/components/icon";

type R = { ok: true; id: string; message?: string } | { ok: false; error: string };

export function QuoteActions({ id, status, remainingHt, mailto }: { id: string; status: string; remainingHt: number; mailto: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [signer, setSigner] = useState("");

  function run(fn: () => Promise<R>, then?: (r: Extract<R, { ok: true }>) => void) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "C'est fait" });
      if (then) then(r);
      else router.refresh();
    });
  }

  return (
    <div className="card rise flex flex-col gap-3 p-5">
      <h2 className="text-sm font-medium">Actions</h2>
      {status === "brouillon" && (
        <>
          <Link href={`/devis/${id}/modifier`} className="btn btn-sec">
            <Icon name="note" />
            Modifier
          </Link>
          <button
            type="button"
            className="btn btn-pri"
            disabled={pending}
            onClick={() => confirm("Émettre le devis ? Il recevra un numéro définitif.") && run(async () => (await emitQuoteAction(id)))}
          >
            <Icon name="check" />
            Émettre le devis
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={pending}
            onClick={() => confirm("Supprimer ce brouillon ?") && run(async () => (await deleteDraftAction("devis", id)), () => router.push("/devis"))}
          >
            <Icon name="trash" />
            Supprimer le brouillon
          </button>
        </>
      )}
      {status === "envoye" && (
        <>
          {mailto && (
            <a className="btn btn-sec" href={mailto}>
              <Icon name="mail" />
              Préparer l&apos;e-mail d&apos;envoi
            </a>
          )}
          <form
            className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => (await acceptQuoteAction(id, signer)));
            }}
          >
            <label className="label">
              Signataire (nom et fonction)
              <input className="input" value={signer} onChange={(e) => setSigner(e.target.value)} required minLength={2} maxLength={200} placeholder="Ex. Marie Durand, gérante" />
            </label>
            <button type="submit" className="btn btn-pri" disabled={pending}>
              <Icon name="check" />
              Marquer accepté
            </button>
          </form>
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => confirm("Marquer ce devis comme refusé ?") && run(async () => (await refuseQuoteAction(id)))}>
            <Icon name="x" />
            Marquer refusé
          </button>
        </>
      )}
      {status === "accepte" && (
        <div className="flex flex-col gap-2">
          {remainingHt > 0 ? (
            <>
              <p className="text-[13px] text-muted-fg">Créer la facture (brouillon) :</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["100", "Totalité"],
                    ["30", "Acompte 30 %"],
                    ["50", "Acompte 50 %"],
                    ["solde", "Solde"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} type="button" className={k === "100" ? "btn btn-pri" : "btn btn-sec"} disabled={pending} onClick={() => run(async () => (await invoiceFromQuoteAction(id, k)), (r) => router.push(`/factures/${r.id}`))}>
                    {l}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="pill tone-ok h-auto whitespace-normal px-3 py-1.5">Devis entièrement facturé.</p>
          )}
        </div>
      )}
      <Link href={`/devis/nouveau?dup=${id}`} className="btn btn-ghost">
        <Icon name="copy" />
        Dupliquer
      </Link>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`pill h-auto whitespace-normal px-3 py-1.5 ${msg.ok ? "tone-ok" : "tone-ko"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
