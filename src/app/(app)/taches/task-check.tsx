"use client";

import { useTransition } from "react";
import { toggleTaskAction } from "@/server/actions/tasks";
import { Icon } from "@/components/icon";

export function TaskCheck({ id, done, label }: { id: string; done: boolean; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => (await toggleTaskAction(id)))}
      aria-label={(done ? "Rouvrir : " : "Marquer comme faite : ") + label}
      aria-pressed={done}
      className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded border ${done ? "border-primary bg-primary text-primary-fg" : "border-border bg-card"}`}
    >
      {done && <Icon name="check" size={12} />}
    </button>
  );
}
