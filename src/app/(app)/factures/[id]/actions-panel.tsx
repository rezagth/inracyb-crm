"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addPaymentAction, createCreditNoteAction, deleteDraftAction, emitInvoiceAction, logReminderAction } from "@/server/actions/documents";
import { PAY_METHODS } from "@/lib/constants";
import { Icon } from "@/components/icon";

type R = { ok: true; id: string; message?: string } | { ok: false; error: string };

export function InvoiceActions({
  id,
  status,
  kind,
  restLabel,
  restInput,
  today,
  hasPayments,
  reminders,
  mailtoSend,
  mailtoReminders,
}: {
  id: string;
  status: string;
  kind: string;
  restLabel: string;
  restInput: string;
  today: string;
  hasPayments: boolean;
  reminders: number[];
  mailtoSend: string | null;
  mailtoReminders: (string | null)[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [amount, setAmount] = useState(restInput);
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<string>(PAY_METHODS[0]);

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

  const levels = [
    [1, "Rappel courtois"],
    [2, "Relance ferme"],
    [3, "Mise en demeure"],
  ] as const;

  return (
    <div className="card rise flex flex-col gap-3 p-5">
      <h2 className="text-sm font-medium">Actions</h2>
      {status === "brouillon" && (
        <>
          <Link href={`/factures/${id}/modifier`} className="btn btn-sec">
            <Icon name="note" />
            Modifier
          </Link>
          <button
            type="button"
            className="btn btn-pri"
            disabled={pending}
            onClick={() => confirm("Émettre la facture ? Elle recevra un numéro définitif et ne sera plus modifiable.") && run(async () => (await emitInvoiceAction(id)))}
          >
            <Icon name="check" />
            Émettre la facture
          </button>
          <button type="button" className="btn btn-danger" disabled={pending} onClick={() => confirm("Supprimer ce brouillon ?") && run(async () => (await deleteDraftAction("facture", id)), () => router.push("/factures"))}>
            <Icon name="trash" />
            Supprimer le brouillon
          </button>
        </>
      )}
      {kind === "facture" && status === "envoyee" && (
        <>
          {mailtoSend && (
            <a className="btn btn-sec" href={mailtoSend}>
              <Icon name="mail" />
              Préparer l&apos;e-mail d&apos;envoi
            </a>
          )}
          <form
            className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => (await addPaymentAction(id, { amount, date, method })));
            }}
          >
            <p className="text-[13px] font-medium">Encaisser un paiement</p>
            <p className="text-xs text-subtle-fg">Reste dû : {restLabel}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="label">
                Montant (€)
                <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </label>
              <label className="label">
                Date
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
            </div>
            <label className="label">
              Moyen
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAY_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-pri" disabled={pending}>
              <Icon name="bank" />
              Enregistrer le paiement
            </button>
          </form>
          <div className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
            <p className="text-[13px] font-medium">Relances</p>
            {levels.map(([lvl, label], i) => {
              const done = reminders.includes(lvl);
              const href = mailtoReminders[i];
              return (
                <div key={lvl} className="flex items-center justify-between gap-2">
                  <span className={`text-[13px] ${done ? "text-subtle-fg" : ""}`}>
                    {done && <Icon name="check" size={12} />} {label}
                  </span>
                  <span className="flex gap-1">
                    {href && (
                      <a className="btn btn-ghost btn-sm" href={href} aria-label={`Préparer l'e-mail : ${label}`}>
                        <Icon name="mail" />
                      </a>
                    )}
                    <button type="button" className="btn btn-sec btn-sm" disabled={pending} onClick={() => run(async () => (await logReminderAction(id, lvl)))}>
                      Noter envoyé
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
          {!hasPayments && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={() => confirm("Créer un avoir qui annule intégralement cette facture ? Cette action est définitive.") && run(async () => (await createCreditNoteAction(id)), (r) => router.push(`/factures/${r.id}`))}
            >
              <Icon name="x" />
              Annuler par un avoir
            </button>
          )}
        </>
      )}
      {status === "payee" && !msg && <p className="pill tone-ok h-auto whitespace-normal px-3 py-1.5">Facture soldée.</p>}
      {status === "annulee" && !msg && <p className="pill tone-neu h-auto whitespace-normal px-3 py-1.5">Facture annulée par avoir.</p>}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`pill h-auto whitespace-normal px-3 py-1.5 ${msg.ok ? "tone-ok" : "tone-ko"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
