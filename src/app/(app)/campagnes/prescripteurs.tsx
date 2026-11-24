"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createCampaignAction } from "@/server/actions/campaigns";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";

export type PrescCandidate = { id: string; name: string; sector: string; email: string; kind: "reglemente" | "partenaire"; why: string | null };
export type PrescData = { limit: number; sent: number; partnersOn: boolean; candidates: PrescCandidate[] };

/** Onglet Prescripteurs : cabinets à qui proposer de recommander InfraCyb à leurs clients (séquence J0, J+7, puis appel). */
export function Prescripteurs({ data, canSend }: { data: PrescData; canSend: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const eligible = useMemo(() => data.candidates.filter((c) => !c.why), [data.candidates]);
  const shown = useMemo(() => eligible.filter((p) => !q.trim() || (p.name + " " + p.sector).toLowerCase().includes(q.trim().toLowerCase())), [eligible, q]);
  const excluded = data.candidates.length - eligible.length;
  const left = Math.max(0, data.limit - data.sent);
  const days = sel.size ? Math.ceil(sel.size / Math.max(1, data.limit)) : 0;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const canLaunch = canSend && sel.size > 0 && name.trim().length > 0 && !pending;

  return (
    <Card title="Nouvelle campagne prescripteurs" actions={<span className="text-xs text-subtle-fg">{data.sent}/{data.limit} mails aujourd&apos;hui (MAIL_DAILY_LIMIT_PRESCRIPTEUR)</span>}>
      <div className="flex flex-col gap-4 p-5">
        <p className="tip text-[13px]">
          Experts-comptables, avocats et notaires : texte sans aucune commission (déontologie), 10 % de remise pour le client recommandé.
          {data.partnersOn ? " Courtiers : texte partenaire, 15 % du HT encaissé avec un accord écrit." : " Courtiers : pas encore visés (PRESCRIPTEUR_PARTENAIRES, après l'immatriculation) ; ils restent des clients potentiels."}
          {" "}Séquence : premier message, relance à J+7, puis une tâche d&apos;appel le lendemain. Ces cabinets ne reçoivent plus la prospection client.
        </p>
        <div className="flex flex-wrap gap-3">
          <input className="input min-w-[220px] flex-1" placeholder="Nom de la campagne (ex. Experts-comptables Lyon)" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Nom de la campagne" />
          <input className="input min-w-[180px]" placeholder="Filtrer la liste…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrer" />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <button type="button" className="btn btn-sec btn-sm" onClick={() => setSel(new Set([...sel, ...shown.map((p) => p.id)]))}>Tout sélectionner ({shown.length})</button>
          <button type="button" className="btn btn-sec btn-sm" onClick={() => setSel(new Set())}>Tout désélectionner</button>
          <span className="text-muted-fg">{eligible.length} cabinet(s) éligible(s){excluded ? ` · ${excluded} exclu(s)` : ""}</span>
        </div>
        <div className="max-h-[320px] overflow-auto rounded-lg border border-border">
          {eligible.length === 0 ? (
            <p className="p-4 text-[13px] text-muted-fg">Aucun cabinet éligible. Il faut une fiche avec un secteur Expertise comptable, Juridique ou Notariat{data.partnersOn ? " (ou Courtage)" : ""} et une adresse e-mail publiée sur le site ou saisie à la main.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="tr">
                    <td className="td w-8"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Sélectionner ${p.name}`} /></td>
                    <td className="td font-medium">{p.name}</td>
                    <td className="td text-muted-fg">{p.sector}</td>
                    <td className="td text-muted-fg">{p.kind === "reglemente" ? "sans commission" : "partenaire 15 %"}</td>
                    <td className="td text-muted-fg">{p.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {excluded > 0 && (
          <details className="text-[13px]">
            <summary className="cursor-pointer text-muted-fg">Voir les {excluded} cabinet(s) exclu(s) et pourquoi</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {data.candidates.filter((c) => c.why).map((c) => (
                <li key={c.id} className="text-muted-fg">{c.name} : {c.why}</li>
              ))}
            </ul>
          </details>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-pri"
            disabled={!canLaunch}
            onClick={() => {
              const first = Math.min(sel.size, left);
              if (!window.confirm(`Lancer « ${name.trim()} » pour ${sel.size} cabinet(s) ?\n\nPremier lot : ${first} mail(s) tout de suite, le reste étalé sur ~${days} jour(s) (plafond ${data.limit}/jour). La relance part automatiquement à J+7, puis une tâche d'appel est créée le lendemain.`)) return;
              start(async () => {
                const r = await createCampaignAction(name, "prescripteur", [...sel]);
                toast(r.ok ? r.message : r.error);
                if (r.ok) { setSel(new Set()); setName(""); }
                router.refresh();
              });
            }}
          >
            <Icon name="mail" />
            {pending ? "Envoi en cours…" : `Lancer la campagne (${sel.size})`}
          </button>
          {sel.size > 0 && <span className="text-xs text-muted-fg">Premier lot : {Math.min(sel.size, left)} mail(s) · fin du J0 vers le {days} jour(s)</span>}
        </div>
      </div>
    </Card>
  );
}
