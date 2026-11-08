"use client";

import { useOptimistic, useTransition } from "react";
import { setAuditAnswerAction, setAuditNoteAction } from "@/server/actions/clients";
import type { Control } from "@/lib/audit";
import { useToast } from "@/components/mod/toast";

const OPTS = [
  ["oui", "Oui", "tone-ok"],
  ["partiel", "Partiel", "tone-warn"],
  ["non", "Non", "tone-ko"],
  ["na", "N/A", "tone-neu"],
] as const;

export function Questionnaire({ auditId, controls, answers, notes }: { auditId: string; controls: Control[]; answers: Record<string, string>; notes: Record<string, string> }) {
  const toast = useToast();
  const [, start] = useTransition();
  const [opt, setOpt] = useOptimistic(answers, (s, p: { id: string; v: string }) => ({ ...s, [p.id]: p.v }));
  const cats = [...new Set(controls.map((c) => c.cat))];
  return (
    <div className="flex flex-col gap-4">
      {cats.map((cat, ci) => (
        <section key={cat} className="card rise overflow-hidden p-0" style={{ animationDelay: `${ci * 40}ms` }}>
          <h2 className="border-b border-border-subtle px-5 py-3.5 text-sm font-medium">{cat}</h2>
          {controls
            .filter((c) => c.cat === cat)
            .map((c) => (
              <div key={c.id} className="flex flex-col gap-2 border-t border-border-subtle px-5 py-3 first:border-t-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="min-w-[240px] flex-1 text-[13px]">
                    {c.q}
                    <span className={`pill ml-2 tone-${c.prio === "haute" ? "ko" : c.prio === "moyenne" ? "warn" : "neu"}`}>{c.prio}</span>
                  </span>
                  <div className="seg" role="radiogroup" aria-label={c.q}>
                    {OPTS.map(([v, l]) => {
                      const on = opt[c.id] === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          className={on ? "on" : ""}
                          onClick={() =>
                            start(async () => {
                              const nv = on ? "" : v;
                              setOpt({ id: c.id, v: nv });
                              const r = await setAuditAnswerAction(auditId, c.id, nv);
                              if (!r.ok) toast(r.error);
                            })
                          }
                        >
                          {l}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {(opt[c.id] === "non" || opt[c.id] === "partiel") && <p className="tip">Recommandation : {c.reco}</p>}
                <input
                  className="input h-8 text-xs"
                  placeholder="Constat (facultatif)"
                  aria-label={`Constat : ${c.q}`}
                  defaultValue={notes[c.id] ?? ""}
                  maxLength={2000}
                  onBlur={(e) => {
                    if ((notes[c.id] ?? "") !== e.target.value) start(async () => void (await setAuditNoteAction(auditId, c.id, e.target.value)));
                  }}
                />
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
