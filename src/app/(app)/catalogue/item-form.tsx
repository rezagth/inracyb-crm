"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { saveCatalogItemAction, toggleCatalogItemAction } from "@/server/actions/settings";
import { OFFERS, UNITS } from "@/lib/constants";
import { FormMessage, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icon";

type Item = { id: string; name: string; offer: string; unit: string; unitPriceCents: number; description: string };

export function ItemForm({ item, onDone }: { item?: Item; onDone?: () => void }) {
  const [state, action] = useActionState(saveCatalogItemAction.bind(null, item?.id ?? null), undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (!item) ref.current?.reset();
      onDone?.();
    }
  }, [state, item, onDone]);
  return (
    <form ref={ref} action={action} className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
      <label className="label col-span-full sm:col-span-2">
        Prestation *
        <input name="name" className="input" required maxLength={200} defaultValue={item?.name} placeholder="Ex. Audit cybersécurité TPE" />
      </label>
      <label className="label">
        Offre
        <select name="offer" className="input" defaultValue={item?.offer ?? "Audit"}>
          {OFFERS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Unité
        <select name="unit" className="input" defaultValue={item?.unit ?? "forfait"}>
          {UNITS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </label>
      <label className="label">
        Prix HT (€) *
        <input name="price" className="input num" inputMode="decimal" required defaultValue={item ? String(item.unitPriceCents / 100).replace(".", ",") : ""} />
      </label>
      <label className="label col-span-full">
        Description (reprise sur les devis)
        <input name="description" className="input" maxLength={500} defaultValue={item?.description} placeholder="Ce qui est inclus, livrables, durée…" />
      </label>
      <div className="col-span-full flex flex-wrap items-center gap-3">
        <SubmitButton className={item ? "btn btn-pri btn-sm" : "btn btn-pri"}>
          {item ? (
            "Enregistrer"
          ) : (
            <>
              <Icon name="plus" />
              Ajouter au catalogue
            </>
          )}
        </SubmitButton>
        {item && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
            Annuler
          </button>
        )}
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ItemRowActions({ item, active }: { item: Item; active: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <span className="flex justify-end gap-1">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
          Modifier
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => (await toggleCatalogItemAction(item.id)))}>
          {active ? "Archiver" : "Réactiver"}
        </button>
      </span>
      {editing && (
        <div className="col-span-full mt-1 rounded-lg border border-border-subtle p-3 text-left">
          <ItemForm item={item} onDone={() => setEditing(false)} />
        </div>
      )}
    </>
  );
}
