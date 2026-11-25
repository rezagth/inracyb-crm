"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";
import { logCallOutcomeAction } from "@/server/actions/calls";
import {
  HEAT_LABEL,
  OUTCOME_LABEL,
  type Heat,
  type Outcome,
} from "@/lib/call-queue";

export type QueueRow = {
  taskId: string;
  companyId: string;
  company: string;
  contact: string;
  phone: string;
  tel: string;
  title: string;
  heat: Heat;
  dueDate: string;
  opening: string;
  attempts: number;
};

const HEAT_TONE: Record<Heat, string> = {
  consulte: "ok",
  repondu: "info",
  retard: "warn",
  jour: "neu",
};
const QUICK: Outcome[] = [
  "pas_de_reponse",
  "messagerie",
  "interesse",
  "pas_interesse",
];

export function CallQueue({
  rows,
  today,
}: {
  rows: QueueRow[];
  today: string;
}) {
  // Liens de synthèse à envoyer : gardés ici, car la ligne de l'appel quitte la file dès que le résultat est noté.
  const [links, setLinks] = useState<{ company: string; url: string }[]>([]);
  const toast = useToast();
  return (
    <>
      {links.map((l) => (
        <div
          key={l.url}
          className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-muted px-5 py-3 text-[13px]"
        >
          <span className="font-medium">
            Synthèse à envoyer à {l.company} :
          </span>
          <input
            readOnly
            value={l.url}
            className="input min-w-0 flex-1"
            onFocus={(e) => e.currentTarget.select()}
            aria-label={`Lien de la synthèse pour ${l.company}`}
          />
          <button
            type="button"
            className="btn btn-sec btn-sm"
            onClick={() =>
              navigator.clipboard.writeText(l.url).then(
                () => toast("Lien copié"),
                () => toast("Copie bloquée : sélectionne le lien"),
              )
            }
          >
            <Icon name="copy" />
            Copier
          </button>
          <button
            type="button"
            className="btn btn-sec btn-sm"
            onClick={() => setLinks((x) => x.filter((y) => y.url !== l.url))}
            aria-label={`Masquer le lien pour ${l.company}`}
          >
            <Icon name="x" />
          </button>
        </div>
      ))}
      {rows.length ? (
        <ol className="divide-y divide-border-subtle">
          {rows.map((r) => (
            <QueueItem
              key={r.taskId}
              r={r}
              today={today}
              onLink={(url) =>
                setLinks((x) => [
                  { company: r.company, url },
                  ...x.filter((y) => y.url !== url),
                ])
              }
            />
          ))}
        </ol>
      ) : (
        <p className="px-5 py-8 text-center text-[13px] text-muted-fg">
          Aucun appel à passer aujourd&apos;hui. Les appels arrivent ici tout
          seuls : J+4 du service Diagnostic, relance des prescripteurs, synthèse
          consultée par un prospect.
        </p>
      )}
    </>
  );
}

function QueueItem({
  r,
  today,
  onLink,
}: {
  r: QueueRow;
  today: string;
  onLink: (url: string) => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"" | "rappeler" | "rdv">("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("10:00");
  const [note, setNote] = useState("");

  const send = (outcome: Outcome) =>
    start(async () => {
      const res = await logCallOutcomeAction({
        taskId: r.taskId,
        outcome,
        date: outcome === "rappeler" || outcome === "rdv" ? date : undefined,
        start: outcome === "rdv" ? time : undefined,
        note: note.trim() || undefined,
      });
      if (!res.ok) return toast(res.error);
      if (res.copy) {
        onLink(res.copy);
        navigator.clipboard?.writeText(res.copy).catch(() => undefined);
      }
      toast(res.message);
      router.refresh();
    });

  return (
    <li className="flex flex-col gap-2 px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`pill tone-${HEAT_TONE[r.heat]}`}>
          {HEAT_LABEL[r.heat]}
        </span>
        <Link href={`/entreprises/${r.companyId}`} className="link font-medium">
          {r.company}
        </Link>
        {r.contact && (
          <span className="text-[13px] text-muted-fg">{r.contact}</span>
        )}
        {r.attempts > 0 && (
          <span className="text-[12px] text-subtle-fg">
            {r.attempts} essai{r.attempts > 1 ? "s" : ""} sans réponse
          </span>
        )}
        <span className="ml-auto">
          {r.tel ? (
            <a href={r.tel} className="btn btn-pri btn-sm">
              <Icon name="phone" />
              {r.phone}
            </a>
          ) : (
            <span className="text-[13px] text-muted-fg">
              Pas de numéro utilisable
            </span>
          )}
        </span>
      </div>
      <p className="text-[13px] text-muted-fg">{r.title}</p>
      {r.opening && (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-muted-fg">
            Phrases d&apos;ouverture
          </summary>
          <p className="mt-1 whitespace-pre-line rounded-md bg-muted px-3 py-2">
            {r.opening}
          </p>
        </details>
      )}
      <>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          placeholder="Note (facultatif) : ce qu'a dit la personne"
          className="input text-[13px]"
          aria-label={`Note sur l'appel à ${r.company}`}
        />
        <div className="flex flex-wrap items-center gap-2">
          {QUICK.map((o) => (
            <button
              key={o}
              type="button"
              disabled={pending}
              onClick={() => send(o)}
              className={`btn btn-sm ${o === "interesse" ? "btn-pri" : "btn-sec"}`}
            >
              {OUTCOME_LABEL[o]}
            </button>
          ))}
          <button
            type="button"
            disabled={pending}
            onClick={() => setMode(mode === "rappeler" ? "" : "rappeler")}
            className="btn btn-sec btn-sm"
            aria-expanded={mode === "rappeler"}
          >
            Rappeler le…
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setMode(mode === "rdv" ? "" : "rdv")}
            className="btn btn-pri btn-sm"
            aria-expanded={mode === "rdv"}
          >
            <Icon name="cal" />
            RDV obtenu
          </button>
        </div>
        {mode && (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <label className="flex items-center gap-2">
              {mode === "rdv" ? "Rendez-vous le" : "Rappel le"}
              <input
                type="date"
                value={date}
                min={today}
                onChange={(e) => setDate(e.target.value)}
                className="input"
              />
            </label>
            {mode === "rdv" && (
              <label className="flex items-center gap-2">
                à
                <input
                  type="time"
                  value={time}
                  step={900}
                  onChange={(e) => setTime(e.target.value)}
                  className="input"
                />
              </label>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => send(mode)}
              className="btn btn-pri btn-sm"
            >
              {mode === "rdv" ? "Créer le rendez-vous" : "Programmer le rappel"}
            </button>
          </div>
        )}
      </>
    </li>
  );
}
