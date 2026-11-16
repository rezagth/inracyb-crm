"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createCampaignAction, queueDiagnosticsAction } from "@/server/actions/campaigns";
import { SEGMENTS, SEGMENT_LABEL, SEGMENT_SECTORS, type Segment } from "@/lib/diagnostic-mails";
import { Card } from "@/components/ui";
import { useToast } from "@/components/mod/toast";
import { fd } from "@/lib/format";

export type DiagProspect = { id: string; name: string; sector: string; target: string };
export type DiagCandidate = { id: string; name: string; sector: string; segment: Segment; email: string; hook: string; contact: string; why: string | null };
export type DiagRow = { id: string; company: string; target: string; checkedOn: string; main: string; mainWording: string; certainCount: number; usable: boolean };

/** Onglet Diagnostic : lancer les mesures passives sur des entreprises choisies, puis consulter constats et rapports. */
export function Diagnostics({ prospects, rows, pending: queued, freshDays, candidates, canSend, left, limit }: { prospects: DiagProspect[]; rows: DiagRow[]; pending: number; freshDays: number; candidates: DiagCandidate[]; canSend: boolean; left: number; limit: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const shown = useMemo(() => prospects.filter((p) => !q.trim() || (p.name + " " + p.sector + " " + p.target).toLowerCase().includes(q.trim().toLowerCase())), [prospects, q]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [name, setName] = useState("");
  const [segment, setSegment] = useState<Segment>("editeurs");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const inSegment = useMemo(() => candidates.filter((c) => c.segment === segment), [candidates, segment]);
  const eligible = inSegment.filter((c) => !c.why);
  const chosen = eligible.filter((c) => picked.has(c.id));
  const pick = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const create = () => {
    if (!window.confirm(`Lancer « ${name.trim()} » (${SEGMENT_LABEL[segment]}) pour ${chosen.length} entreprise(s) ?\n\nChaque constat est mesuré de nouveau juste avant l'envoi. Premier lot : ${Math.min(chosen.length, left)} mail(s) tout de suite (plafond du jour : ${limit}), le reste les jours ouvrés suivants. Relances à J+3, J+7 et J+14.`)) return;
    start(async () => {
      const r = await createCampaignAction(name, "diagnostic", chosen.map((c) => c.id), segment);
      toast(r.ok ? r.message : r.error);
      if (r.ok) { setPicked(new Set()); setName(""); }
      router.refresh();
    });
  };
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

      <Card title="Nouvelle campagne Diagnostic" actions={<span className="text-xs text-subtle-fg">{left} mail(s) possibles aujourd&apos;hui sur {limit}</span>}>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap gap-3">
            <input className="input min-w-[220px] flex-1" placeholder="Nom de la campagne (ex. ESN Île-de-France)" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Nom de la campagne" />
            <select className="input" value={segment} onChange={(e) => { setSegment(e.target.value as Segment); setPicked(new Set()); }} aria-label="Segment">
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <p className="text-[13px] text-muted-fg">
            Secteurs admis dans ce segment : {SEGMENT_SECTORS[segment].join(", ")}. N&apos;apparaissent que les entreprises dont le diagnostic contient un constat d&apos;accroche mesuré depuis {freshDays} jours au plus (HSTS seul ne suffit pas). {inSegment.length - eligible.length ? `${inSegment.length - eligible.length} exclue(s) par les règles d'entrée.` : ""}
          </p>
          <div className="max-h-[280px] overflow-auto rounded-lg border border-border">
            {inSegment.length === 0 ? (
              <p className="p-4 text-[13px] text-muted-fg">Aucune entreprise de ce segment avec un constat d&apos;accroche récent. Lance d&apos;abord un diagnostic ci-dessus, et vérifie le secteur sur la fiche.</p>
            ) : (
              <table className="w-full">
                <tbody>
                  {inSegment.map((c) => (
                    <tr key={c.id} className="tr">
                      <td className="td w-8"><input type="checkbox" disabled={!!c.why} checked={picked.has(c.id) && !c.why} onChange={() => pick(c.id)} aria-label={`Sélectionner ${c.name}`} /></td>
                      <td className="td font-medium">{c.name}</td>
                      <td className="td text-muted-fg">{c.sector}</td>
                      <td className="td text-muted-fg">{c.contact || "—"} · {c.email}</td>
                      <td className="td text-muted-fg">{c.why ? `Exclue : ${c.why}` : c.hook}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-pri" disabled={busy || !canSend || chosen.length === 0 || !name.trim()} onClick={create}>
              {busy ? "Envoi en cours…" : `Lancer la campagne (${chosen.length})`}
            </button>
            <button type="button" className="btn btn-sec btn-sm" onClick={() => setPicked(new Set(eligible.map((c) => c.id)))}>Tout sélectionner ({eligible.length})</button>
            {!canSend && <span className="text-xs text-muted-fg">Envois bloqués : Brevo ou APP_URL non configuré.</span>}
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
