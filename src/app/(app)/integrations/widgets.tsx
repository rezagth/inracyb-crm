"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { ignoreBankLineAction, importBankCsvAction, matchBankLineAction, updateIntegrationAction } from "@/server/actions/finance";
import { FormMessage, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";

export function IntegField({ name, label, value, placeholder, type = "text" }: { name: string; label: string; value: string; placeholder?: string; type?: string }) {
  const [state, action] = useActionState(updateIntegrationAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="label">
        {label}
        <span className="flex gap-2">
          <input className="input" name={name} type={type} defaultValue={value} placeholder={placeholder} maxLength={300} />
          <SubmitButton className="btn btn-sec shrink-0">OK</SubmitButton>
        </span>
      </label>
      <FormMessage state={state} />
    </form>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  return (
    <button type="button" className="btn btn-sec btn-sm" onClick={() => navigator.clipboard.writeText(text).then(() => toast(`${label} copié`), () => toast("Copie bloquée"))}>
      <Icon name="copy" />
      Copier le lien
    </button>
  );
}

export function BankImport() {
  const ref = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className="btn btn-sec btn-sm" disabled={pending} onClick={() => ref.current?.click()}>
        <Icon name="download" />
        {pending ? "Import…" : "Importer un relevé (CSV)"}
      </button>
      <input
        ref={ref}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 2_000_000) return toast("Fichier trop volumineux (2 Mo maximum)");
          start(async () => {
            const r = await importBankCsvAction(await file.text());
            toast(r.ok ? r.message : r.error);
            router.refresh();
          });
        }}
      />
    </>
  );
}

export function BankRowActions({ id, options, suggested }: { id: string; options: { id: string; label: string }[]; suggested: string }) {
  const [sel, setSel] = useState(suggested);
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? (r.message ?? "") : (r.error ?? "Erreur"));
      router.refresh();
    });
  return (
    <>
      <select className="input h-[30px] text-xs" aria-label="Facture à rapprocher" value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">Choisir une facture…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="flex justify-end gap-1.5">
        <button type="button" className="btn btn-pri btn-sm" disabled={pending} onClick={() => run(async () => (await matchBankLineAction(id, sel)))}>
          Rapprocher
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(async () => (await ignoreBankLineAction(id)))}>
          Ignorer
        </button>
      </span>
    </>
  );
}
