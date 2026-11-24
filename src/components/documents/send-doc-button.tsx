"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { sendDocumentMailAction } from "@/server/actions/billing-mail";

export type Recipient = { email: string; name: string };

/** Bouton + fenêtre d'envoi au client : destinataire, objet et texte modifiables, PDF joint. Rien ne part sans clic sur « Envoyer ». */
export function SendDocButton(p: {
  kind: "devis" | "facture";
  id: string;
  label: string;
  recipients: Recipient[];
  subject: string;
  text: string;
  attachment: string;
  reminderLevel?: 1 | 2;
  alreadySent?: string | null;
  primary?: boolean;
  small?: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [pending, start] = useTransition();
  const [to, setTo] = useState(p.recipients[0]?.email ?? "");
  const [subject, setSubject] = useState(p.subject);
  const [text, setText] = useState(p.text);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function open() {
    setTo(p.recipients[0]?.email ?? "");
    setSubject(p.subject);
    setText(p.text);
    setMsg(null);
    ref.current?.showModal();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const toName = p.recipients.find((r) => r.email.toLowerCase() === to.trim().toLowerCase())?.name;
    start(async () => {
      const r = await sendDocumentMailAction({ kind: p.kind, id: p.id, to, toName, subject, text, reminderLevel: p.reminderLevel });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message });
      router.refresh();
      setTimeout(() => ref.current?.close(), 1200);
    });
  }

  return (
    <>
      <button type="button" className={`btn ${p.primary ? "btn-pri" : "btn-sec"} ${p.small ? "btn-sm" : ""}`} onClick={open}>
        <Icon name="mail" />
        {p.label}
      </button>
      <dialog ref={ref} className="modal" aria-labelledby={`${uid}-t`} onClick={(e) => e.target === ref.current && !pending && ref.current?.close()}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <h2 id={`${uid}-t`} className="text-base font-semibold">
              {p.label}
            </h2>
            <button type="button" className="btn btn-ghost size-8 p-0" aria-label="Fermer" disabled={pending} onClick={() => ref.current?.close()}>
              <Icon name="x" />
            </button>
          </div>
          {p.alreadySent && <p className="pill tone-warn h-auto whitespace-normal px-3 py-1.5">{p.alreadySent}</p>}
          <label className="label">
            Destinataire
            <input className="input" type="email" required list={`${uid}-to`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="adresse@client.fr" />
            <datalist id={`${uid}-to`}>
              {p.recipients.map((r) => (
                <option key={r.email} value={r.email}>
                  {r.name}
                </option>
              ))}
            </datalist>
          </label>
          <label className="label">
            Objet
            <input className="input" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="label">
            Message
            <textarea className="input" required rows={10} maxLength={10_000} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <p className="flex items-center gap-1.5 text-xs text-muted-fg">
            <Icon name="file" size={12} />
            Pièce jointe : {p.attachment}
          </p>
          {msg && (
            <p role={msg.ok ? "status" : "alert"} className={`pill h-auto whitespace-normal px-3 py-1.5 ${msg.ok ? "tone-ok" : "tone-ko"}`}>
              {msg.text}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => ref.current?.close()}>
              Annuler
            </button>
            <button type="submit" className="btn btn-pri" disabled={pending || msg?.ok === true}>
              <Icon name="mail" />
              {pending ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
