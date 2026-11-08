"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteRecordAction, patchRecordAction } from "@/server/actions/records";
import { Icon } from "@/components/icon";
import { useToast } from "./toast";

function usePatch() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, silent = false) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? "Erreur");
      else if (!silent || (r.message && r.message !== "Modifié")) toast(r.message ?? "Modifié");
      router.refresh();
    });
  return { pending, run };
}

/** Liste déroulante qui modifie un champ en ligne (statut…). */
export function PatchSelect({ entity, id, field, value, options, label }: { entity: string; id: string; field: string; value: string; options: readonly (readonly [string, string])[]; label: string }) {
  const { pending, run } = usePatch();
  return (
    <select className="input h-[30px] text-xs" aria-label={label} value={value} disabled={pending} onChange={(e) => run(async () => (await patchRecordAction(entity, id, field, e.target.value)), true)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** Case à cocher qui modifie un booléen en ligne. */
export function PatchCheck({ entity, id, field, value, label }: { entity: string; id: string; field: string; value: boolean; label: string }) {
  const { pending, run } = usePatch();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={value}
      aria-label={label}
      title={label}
      onClick={() => run(async () => (await patchRecordAction(entity, id, field, !value)), true)}
      className={`grid size-[18px] place-items-center rounded border ${value ? "border-primary bg-primary text-primary-fg" : "border-border bg-card"}`}
    >
      {value && <Icon name="check" size={12} />}
    </button>
  );
}

export function PatchNumber({ entity, id, field, value, label }: { entity: string; id: string; field: string; value: number; label: string }) {
  const { pending, run } = usePatch();
  return (
    <span className="flex items-center gap-1">
      <button type="button" className="btn btn-ghost btn-sm size-7 p-0" disabled={pending || value <= 0} aria-label={`${label} : retirer 1`} onClick={() => run(async () => (await patchRecordAction(entity, id, field, value - 1)), true)}>
        −
      </button>
      <span className="num w-6 text-center">{value}</span>
      <button type="button" className="btn btn-ghost btn-sm size-7 p-0" disabled={pending} aria-label={`${label} : ajouter 1`} onClick={() => run(async () => (await patchRecordAction(entity, id, field, value + 1)), true)}>
        +
      </button>
    </span>
  );
}

export function DeleteButton({ entity, id, label = "Supprimer", confirmText = "Supprimer définitivement cet élément ?" }: { entity: string; id: string; label?: string; confirmText?: string }) {
  const { pending, run } = usePatch();
  return (
    <button type="button" className="btn btn-ghost btn-sm" disabled={pending} aria-label={label} title={label} onClick={() => confirm(confirmText) && run(async () => (await deleteRecordAction(entity, id)))}>
      <Icon name="trash" />
    </button>
  );
}

/** Bouton qui lance une action serveur (ex. facturer un contrat) et affiche le résultat. */
export function RunButton({ action, label, primary, small = true, confirmText }: { action: () => Promise<{ ok: boolean; message?: string; error?: string }>; label: string; primary?: boolean; small?: boolean; confirmText?: string }) {
  const { pending, run } = usePatch();
  return (
    <button type="button" className={`btn ${primary ? "btn-pri" : "btn-sec"} ${small ? "btn-sm" : ""}`} disabled={pending} onClick={() => (!confirmText || confirm(confirmText)) && run(action)}>
      {pending ? "…" : label}
    </button>
  );
}
