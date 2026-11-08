"use client";

import { useActionState, useRef, useEffect, useTransition } from "react";
import { addActivityAction, addContactAction, deleteContactAction, deleteCompanyAction, moveStageAction } from "@/server/actions/companies";
import { createTaskAction } from "@/server/actions/tasks";
import { STAGES } from "@/lib/constants";
import { today } from "@/lib/format";
import { FormMessage, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icon";

function useResetOnSuccess(state: { ok: boolean } | undefined) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function ActivityForm({ companyId }: { companyId: string }) {
  const [state, action] = useActionState(addActivityAction.bind(null, companyId), undefined);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <label className="label w-[160px]">
          Type
          <select name="type" className="input" defaultValue="call">
            <option value="call">Appel</option>
            <option value="mail">Mail</option>
            <option value="note">Note</option>
          </select>
        </label>
        <label className="label w-[180px]">
          Résultat (appel)
          <select name="result" className="input" defaultValue="Joint">
            <option>Joint</option>
            <option>RDV obtenu</option>
            <option>Messagerie</option>
            <option>Pas de réponse</option>
          </select>
        </label>
      </div>
      <label className="label">
        Ce qui s&apos;est dit
        <textarea name="text" className="input" required maxLength={4000} placeholder="Besoin, objections, prochaine étape…" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Enregistrer</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ContactForm({ companyId }: { companyId: string }) {
  const [state, action] = useActionState(addContactAction.bind(null, companyId), undefined);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
      <label className="label">
        Prénom
        <input name="firstName" className="input" maxLength={80} />
      </label>
      <label className="label">
        Nom
        <input name="lastName" className="input" maxLength={80} />
      </label>
      <label className="label">
        Fonction
        <input name="role" className="input" maxLength={120} />
      </label>
      <label className="label">
        E-mail
        <input name="email" type="email" className="input" maxLength={200} />
      </label>
      <label className="label">
        Téléphone
        <input name="phone" type="tel" className="input" maxLength={40} />
      </label>
      <div className="col-span-full flex flex-wrap items-center gap-3">
        <SubmitButton className="btn btn-sec">
          <Icon name="plus" />
          Ajouter le contact
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteContactButton({ id, companyId }: { id: string; companyId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => start(async () => (await deleteContactAction(id, companyId)))} aria-label="Supprimer le contact">
      <Icon name="trash" />
    </button>
  );
}

export function StageSelect({ id, stage }: { id: string; stage: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      className="input h-9 w-auto"
      aria-label="Étape du pipeline"
      defaultValue={stage}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        start(async () => {
          await moveStageAction(id, v);
        });
      }}
    >
      {STAGES.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

export function TaskForm({ companyId }: { companyId?: string }) {
  const [state, action] = useActionState(createTaskAction, undefined);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      {companyId && <input type="hidden" name="companyId" value={companyId} />}
      <label className="label min-w-[240px] flex-1">
        Tâche
        <input name="title" className="input" required maxLength={300} placeholder="Ex. Relancer sur le devis" />
      </label>
      <label className="label w-[160px]">
        Échéance
        <input name="dueDate" type="date" className="input" defaultValue={today()} />
      </label>
      <label className="label w-[140px]">
        Priorité
        <select name="priority" className="input" defaultValue="moyenne">
          <option value="haute">Haute</option>
          <option value="moyenne">Moyenne</option>
          <option value="basse">Basse</option>
        </select>
      </label>
      <SubmitButton className="btn btn-sec">
        <Icon name="plus" />
        Ajouter
      </SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteCompanyButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-danger btn-sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("Supprimer définitivement cette entreprise et son historique ?")) return;
        start(async () => {
          try {
            await deleteCompanyAction(id);
          } catch (e) {
            alert(e instanceof Error ? e.message : "Suppression impossible.");
          }
        });
      }}
    >
      <Icon name="trash" />
      Supprimer
    </button>
  );
}
