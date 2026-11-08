"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { useToast } from "@/components/mod/toast";

export function AutoSwitch({ on, label, action }: { on: boolean; label: string; action: () => Promise<{ ok: boolean; message?: string; error?: string }> }) {
  const [opt, setOpt] = useOptimistic(on);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={opt}
      aria-label={(opt ? "Désactiver : " : "Activer : ") + label}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOpt(!opt);
          const r = await action();
          toast(r.ok ? (r.message ?? "") : (r.error ?? "Erreur"));
          router.refresh();
        })
      }
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${opt ? "bg-accent" : "bg-border"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${opt ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
