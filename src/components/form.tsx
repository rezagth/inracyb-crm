"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn btn-pri", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (pendingText ?? "Enregistrement…") : children}
    </button>
  );
}

export function FormMessage({ state }: { state?: { ok: boolean; error?: string; message?: string } | { error?: string } }) {
  if (!state) return null;
  if ("error" in state && state.error)
    return (
      <p role="alert" className="pill tone-ko h-auto whitespace-normal px-3 py-1.5">
        {state.error}
      </p>
    );
  if ("message" in state && state.message)
    return (
      <p role="status" className="pill tone-ok h-auto whitespace-normal px-3 py-1.5">
        {state.message}
      </p>
    );
  return null;
}
