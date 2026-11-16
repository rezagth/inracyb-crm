"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { queueDiagnosticsAction } from "@/server/actions/campaigns";
import { Card } from "@/components/ui";
import { useToast } from "@/components/mod/toast";
import { fd } from "@/lib/format";

export type DiagProspect = { id: string; name: string; sector: string; target: string };
export type DiagRow = { id: string; company: string; target: string; checkedOn: string; main: string; mainWording: string; certainCount: number; usable: boolean };

/** Onglet Diagnostic : lancer les mesures passives sur des entreprises choisies, puis consulter constats et rapports. */
export function Diagnostics({ prospects, rows, pending: queued, freshDays }: { prospects: DiagProspect[]; rows: DiagRow[]; pending: number; freshDays: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const shown = useMemo(() => prospects.filter((p) => !q.trim() || (p.name + " " + p.sector + " " + p.target).toLowerCase().includes(q.trim().toLowerCase())), [prospects, q]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const launch = () =>
    start(async () => {
      const r = await queueDiagnosticsAction([...sel]);
      toast(r.ok ? r.message : r.error);
      if (r.ok) setSel(new Set());
      router.refresh();
    });

  return (
    <>
      <Card title="Lancer un diagnostic" actions={<span className="text-xs text-subtle-fg">{queued ? `${queued} en attente · ` : ""}données publiques uniquement</span>}>
        <div className="flex flex-col gap-4 p-5">
          <p className="text-[13px] text-muted-fg">
            Lecture passive du domaine : SPF, DMARC, MX, MTA-STS, DKIM (sélecteurs courants), certificat HTTPS, en-têtes de la page d&apos;accueil, security.txt, domaines proches. Aucun balayage de ports, aucune tentative de connexion. Ce qui ne tient pas dans le temps imparti est repris automatiquement chaque jour ouvré.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <input className="input min-w-[180px]" placeholder="Filtrer la liste…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrer" />
            <button type="button" className="btn btn-sec btn-sm" onClick={() => setSel(new Set([...sel, ...shown.slice(0, 200).map((p) => p.id)]))}>Tout sélectionner ({Math.min(shown.length, 200)})</button>
            <button type="button" className="btn btn-sec btn-sm" onClick={() => setSel(new Set())}>Tout désélectionner</button>
            <span className="text-muted-fg">{prospects.length} entreprise(s) avec un domaine exploitable</span>
          </div>
          <div className="max-h-[280px] overflow-auto rounded-lg border border-border">
            {prospects.length === 0 ? (
              <p className="p-4 text-[13px] text-muted-fg">Aucune entreprise avec un domaine exploitable. Il faut une adresse e-mail professionnelle ou « Site web : https://… » dans les notes.</p>
            ) : (
              <table className="w-full">
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id} className="tr">
                      <td className="td w-8"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Sélectionner ${p.name}`} /></td>
                      <td className="td font-medium">{p.name}</td>
                      <td className="td text-muted-fg">{p.sector}</td>
                      <td className="td text-muted-fg">{p.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <button type="button" className="btn btn-pri" disabled={busy || sel.size === 0 || sel.size > 200} onClick={launch}>
              {busy ? "Mesures en cours…" : `Diagnostiquer (${sel.size})`}
            </button>
          </div>
        </div>
      </Card>

      <Card title="Diagnostics terminés" actions={<span className="text-xs text-subtle-fg">Un constat sert à un mail pendant {freshDays} jours, puis il doit être mesuré de nouveau</span>}>
        {rows.length === 0 ? (
          <p className="p-5 text-[13px] text-muted-fg">Aucun diagnostic pour l&apos;instant.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full">
              <thead>
                <tr><th className="th">Entreprise</th><th className="th">Domaine</th><th className="th">Mesuré le</th><th className="th">Constat principal</th><th className="th">Constats certains</th><th className="th" /></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="tr">
                    <td className="td font-medium">{r.company}</td>
                    <td className="td text-muted-fg">{r.target}</td>
                    <td className="td num text-muted-fg">{fd(r.checkedOn)}{r.usable ? "" : r.certainCount ? " · à refaire" : ""}</td>
                    <td className="td text-muted-fg" title={r.mainWording}>{r.main || "Aucun constat certain"}</td>
                    <td className="td num">{r.certainCount}</td>
                    <td className="td text-right"><a className="link" href={`/api/exports/diagnostic/${r.id}`} target="_blank" rel="noreferrer">Rapport</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
