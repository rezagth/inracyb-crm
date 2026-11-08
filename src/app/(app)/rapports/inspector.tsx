"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteReportAction, saveReportAction } from "@/server/actions/finance";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";

export function Inspector({ metric, group, viz, metrics, groups, saved }: { metric: string; group: string; viz: string; metrics: Record<string, string>; groups: Record<string, string>; saved: { id: string; name: string; config: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const go = (p: Record<string, string>) => router.replace(`/rapports?${new URLSearchParams({ metric, group, viz, ...p })}`);
  const sel = (label: string, value: string, opts: Record<string, string>, key: string) => (
    <label className="label">
      {label}
      <select className="input" value={value} onChange={(e) => go({ [key]: e.target.value })}>
        {Object.entries(opts).map(([k, l]) => (
          <option key={k} value={k}>
            {key === "group" ? `Par ${l.toLowerCase()}` : l}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <aside className="card rise flex max-w-full flex-[1_1_300px] flex-col gap-4 p-5" style={{ animationDelay: "120ms" }}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Inspecteur</h2>
        <span className="flex gap-2">
          <button type="button" className="btn btn-sec btn-sm" onClick={() => router.replace("/rapports")}>
            Réinitialiser
          </button>
          <button
            type="button"
            className="btn btn-pri btn-sm"
            disabled={pending}
            onClick={() => {
              const name = prompt("Nom du rapport", `${metrics[metric]} par ${groups[group].toLowerCase()}`);
              if (!name) return;
              start(async () => {
                const r = await saveReportAction(name, JSON.stringify({ metric, group, viz }));
                toast(r.ok ? r.message : r.error);
                router.refresh();
              });
            }}
          >
            Enregistrer
          </button>
        </span>
      </div>
      <div className="label">
        Source de données
        <span className="input flex items-center gap-2 text-fg">
          <Icon name="dash" />
          Base InfraCyb CRM
        </span>
      </div>
      {sel("Métrique", metric, metrics, "metric")}
      {sel("Regroupement", group, groups, "group")}
      {sel("Visualisation", viz, { v: "Barres verticales", h: "Barres horizontales" }, "viz")}
      {saved.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="sec">Rapports enregistrés</span>
          {saved.map((s) => {
            const c = JSON.parse(s.config) as Record<string, string>;
            return (
              <span key={s.id} className="flex items-center gap-1">
                <Link href={`/rapports?${new URLSearchParams(c)}`} className="mitem flex-1 py-1.5">
                  {s.name}
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label={`Supprimer ${s.name}`}
                  onClick={() =>
                    start(async () => {
                      await deleteReportAction(s.id);
                      router.refresh();
                    })
                  }
                >
                  <Icon name="trash" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </aside>
  );
}

export function ReportDownload({ filename, header, rows }: { filename: string; header: string[]; rows: string[][] }) {
  return (
    <button
      type="button"
      className="btn btn-sec btn-sm"
      onClick={() => {
        const esc = (v: string) => `"${String(v).replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`;
        const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      }}
    >
      <Icon name="download" />
      Télécharger
    </button>
  );
}
