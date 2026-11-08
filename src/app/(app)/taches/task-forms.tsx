"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { createTaskAction, deleteTaskAction } from "@/server/actions/tasks";
import { today } from "@/lib/format";
import { FormMessage, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icon";

export function StandaloneTaskForm({ companies }: { companies: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createTaskAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <label className="label min-w-[240px] flex-1">
        Nouvelle tâche
        <input name="title" className="input" required maxLength={300} placeholder="Ex. Relancer le cabinet Martin" />
      </label>
      <label className="label w-[200px]">
        Client (facultatif)
        <select name="companyId" className="input" defaultValue="">
          <option value="">—</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="label w-[160px]">
        Échéance
        <input name="dueDate" type="date" className="input" defaultValue={today()} />
      </label>
      <label className="label w-[130px]">
        Priorité
        <select name="priority" className="input" defaultValue="moyenne">
          <option value="haute">Haute</option>
          <option value="moyenne">Moyenne</option>
          <option value="basse">Basse</option>
        </select>
      </label>
      <SubmitButton>
        <Icon name="plus" />
        Ajouter
      </SubmitButton>
      <div className="w-full empty:hidden">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteTaskButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-ghost btn-sm" disabled={pending} aria-label="Supprimer la tâche" onClick={() => confirm("Supprimer cette tâche ?") && start(async () => (await deleteTaskAction(id)))}>
      <Icon name="trash" />
    </button>
  );
}
