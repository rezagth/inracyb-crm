"use client";

import { useState, useTransition } from "react";
import { markContractSentAction } from "@/server/actions/contract";

/** Une fois le contrat envoyé, laisse une trace dans StratCyber (aucun e-mail ni donnée sensible n'est transmis). */
export function ContractTrace({ quoteId, reference, disabled }: { quoteId: string; reference: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-pri"
        disabled={pending || disabled}
        onClick={() => confirm("Confirmer que le contrat a été envoyé au client ?") && start(async () => {
          const r = await markContractSentAction(quoteId, reference);
          setMsg({ ok: r.ok, text: r.ok ? r.message : r.error });
        })}
      >
        J&apos;ai envoyé le contrat
      </button>
      {msg && <p role="status" className={`text-xs ${msg.ok ? "text-ok" : "text-ko"}`}>{msg.text}</p>}
    </>
  );
}
