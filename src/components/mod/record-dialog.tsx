"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveRecordAction } from "@/server/actions/records";
import { FORMS } from "@/lib/forms";
import { Icon, type IconName } from "@/components/icon";
import { useToast } from "./toast";

export type Opt = { id: string; name: string };

/** Bouton qui ouvre un formulaire générique dans une boîte de dialogue (natif <dialog>, accessible au clavier). */
export function FormButton({
  form,
  label,
  primary,
  small,
  icon = "plus",
  id = null,
  preset,
  companies = [],
  missions = [],
  redirectTo,
  className,
  autoOpen,
}: {
  form: string;
  label: string;
  primary?: boolean;
  small?: boolean;
  icon?: IconName | null;
  id?: string | null;
  preset?: Record<string, string>;
  companies?: Opt[];
  missions?: Opt[];
  redirectTo?: string;
  className?: string;
  autoOpen?: boolean;
}) {
  const def = FORMS[form];
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const toast = useToast();
  const [vals, setVals] = useState<Record<string, string>>(() => (autoOpen && def ? { ...def.defaults(), ...(preset ?? {}) } : {}));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (autoOpen) ref.current?.showModal();
  }, [autoOpen]);
  if (!def) return null;

  const open = () => {
    setVals({ ...def.defaults(), ...(preset ?? {}) });
    setErr(null);
    ref.current?.showModal();
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveRecordAction(form, id, vals);
      if (!r.ok) return setErr(r.error);
      ref.current?.close();
      toast(r.message);
      if (redirectTo) router.push(redirectTo.replace("{id}", r.id));
      router.refresh();
    });
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setVals((v) => ({ ...v, [k]: e.target.value }));

  return (
    <>
      <button type="button" className={className ?? `btn ${primary ? "btn-pri" : "btn-sec"} ${small ? "btn-sm" : ""}`} onClick={open}>
        {icon && <Icon name={icon} />}
        {label}
      </button>
      <dialog ref={ref} className="modal" aria-labelledby={`dlg-${form}`} onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <h2 id={`dlg-${form}`} className="text-base font-semibold">
              {def.title}
            </h2>
            <button type="button" className="btn btn-ghost size-8 p-0" aria-label="Fermer" onClick={() => ref.current?.close()}>
              <Icon name="x" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {def.fields.map((f) => {
              const common = { value: vals[f.k] ?? "", onChange: set(f.k), required: f.required, className: "input", name: f.k };
              return (
                <label key={f.k} className={`label ${f.full || f.kind === "area" ? "sm:col-span-2" : ""}`}>
                  {f.l}
                  {f.kind === "select" ? (
                    <select {...common}>
                      {f.opts!.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  ) : f.kind === "company" || f.kind === "mission" ? (
                    <select {...common}>
                      <option value="">{f.kind === "mission" ? "Aucune (temps interne)" : f.required ? "Choisir…" : "Aucune"}</option>
                      {(f.kind === "company" ? companies : missions).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : f.kind === "area" ? (
                    <textarea {...common} placeholder={f.ph} rows={4} />
                  ) : (
                    <input {...common} type={f.kind === "number" ? "text" : f.kind} inputMode={f.kind === "number" ? "decimal" : undefined} placeholder={f.ph} />
                  )}
                </label>
              );
            })}
          </div>
          {err && (
            <p role="alert" className="pill tone-ko h-auto whitespace-normal px-3 py-1.5">
              {err}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>
              Annuler
            </button>
            <button type="submit" className="btn btn-pri" disabled={pending}>
              {pending ? "Enregistrement…" : (def.submit ?? "Enregistrer")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
