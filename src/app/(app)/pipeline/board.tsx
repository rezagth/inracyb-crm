"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { moveStageAction } from "@/server/actions/companies";
import { OFFERS, STAGES } from "@/lib/constants";
import { eur, fd } from "@/lib/format";

type CardData = { id: string; name: string; stage: string; sector: string; offer: string; priority: string; amountCents: number; lastContact: string | null; contact: string };

export function Board({ initial }: { initial: CardData[] }) {
  const [cards, setOptimistic] = useOptimistic(initial, (state, move: { id: string; stage: string }) => state.map((c) => (c.id === move.id ? { ...c, stage: move.stage } : c)));
  const [, start] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function move(id: string, stage: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    start(async () => {
      setOptimistic({ id, stage });
      const r = await moveStageAction(id, stage);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Étape mise à jour" } : { ok: false, text: r.error });
    });
  }

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {msg?.text}
      </p>
      {msg && !msg.ok && (
        <p role="alert" className="pill tone-ko mb-3 h-auto px-3 py-1.5">
          {msg.text}
        </p>
      )}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
        {STAGES.map((s) => {
          const col = cards.filter((c) => c.stage === s.id);
          const total = col.reduce((a, c) => a + c.amountCents, 0);
          return (
            <section
              key={s.id}
              aria-label={s.label}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(s.id);
              }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                move(e.dataTransfer.getData("text/plain"), s.id);
              }}
              className={`flex w-[264px] shrink-0 flex-col rounded-xl border bg-muted/50 transition-colors ${over === s.id ? "border-accent bg-accent-soft" : "border-border-subtle"}`}
            >
              <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <span className={`tone-${s.tone} size-2 rounded-full bg-current`} aria-hidden />
                  {s.label}
                  <span className="num text-xs text-subtle-fg">{col.length}</span>
                </span>
                <span className="num text-xs text-subtle-fg">{total ? eur(total, { round: true }) : ""}</span>
              </header>
              <ul className="flex min-h-[120px] flex-col gap-2 px-2 pb-2">
                {col.map((c) => (
                  <li
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="card cursor-grab p-3 active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/entreprises/${c.id}`} className="link text-[13px] font-medium leading-snug">
                        {c.name}
                      </Link>
                      {c.priority === "haute" && <span className="pill tone-ko shrink-0">Haute</span>}
                    </div>
                    <p className="mt-1 text-xs text-subtle-fg">
                      {c.contact ? `${c.contact} · ` : ""}
                      {c.sector}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-fg">{OFFERS.find((o) => o.id === c.offer)?.label ?? c.offer}</span>
                      <span className="num font-medium">{c.amountCents ? eur(c.amountCents, { round: true }) : "—"}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
                      <span className="num text-[11px] text-subtle-fg">{c.lastContact ? `Contact ${fd(c.lastContact)}` : "Jamais contacté"}</span>
                      <select
                        aria-label={`Déplacer ${c.name}`}
                        className="h-7 rounded-md border border-border bg-card px-1.5 text-[11px]"
                        value={c.stage}
                        onChange={(e) => move(c.id, e.target.value)}
                      >
                        {STAGES.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
