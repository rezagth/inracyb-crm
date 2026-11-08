"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "@/components/icon";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function ComiteButton({ companies }: { companies: { id: string; name: string }[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const now = new Date();
  const [co, setCo] = useState("");
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  return (
    <>
      <button type="button" className="btn btn-sec btn-sm" onClick={() => ref.current?.showModal()}>
        <Icon name="note" />
        Compte rendu de comité
      </button>
      <dialog ref={ref} className="modal" aria-labelledby="dlg-comite">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (co) router.push(`/plans/comite?co=${co}&m=${month}`);
          }}
        >
          <h2 id="dlg-comite" className="text-base font-semibold">
            Compte rendu de comité sécurité
          </h2>
          <label className="label">
            Client *
            <select className="input" value={co} onChange={(e) => setCo(e.target.value)} required>
              <option value="">Choisir…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Période
            <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <p className="tip">
            Le compte rendu reprend le plan d&apos;action, les incidents, le support et le temps passé en {MONTHS[Number(month.slice(5)) - 1] ?? ""}.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>
              Annuler
            </button>
            <button type="submit" className="btn btn-pri">
              Préparer le compte rendu
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
