"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createCampaignAction, runCampaignsNowAction, setCampaignStatusAction, stopItemAction } from "@/server/actions/campaigns";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";
import { OFFER_KIT, type OfferKey } from "@/lib/prospection";
import { STEP_LABELS } from "@/lib/campaign";
import { fd } from "@/lib/format";

type P = { id: string; name: string; sector: string; email: string; why: string | null };
type Item = { id: string; company: string; step: number; due: string; status: string; reason: string; error: string };
type C = { id: string; name: string; offer: string; status: string; items: Item[] };

const STATUS: Record<string, string> = { active: "En cours", pause: "En pause", terminee: "Terminée" };

export function Campagnes({ prospects, offers, ready, urlOk, dailyLimit, sentToday, fromEmail, campaigns }: { prospects: P[]; offers: OfferKey[]; ready: boolean; urlOk: boolean; dailyLimit: number; sentToday: number; fromEmail: string; campaigns: C[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [offer, setOffer] = useState<OfferKey>(offers[0]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const eligible = useMemo(() => prospects.filter((p) => !p.why), [prospects]);
  const shown = useMemo(() => eligible.filter((p) => !q.trim() || (p.name + " " + p.sector).toLowerCase().includes(q.trim().toLowerCase())), [eligible, q]);
  const excluded = prospects.length - eligible.length;
  const left = Math.max(0, dailyLimit - sentToday);
  const days = sel.size ? Math.ceil(sel.size / Math.max(1, dailyLimit)) : 0;

  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? r.message : r.error);
      if (r.ok) after?.();
      router.refresh();
    });

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const canLaunch = ready && urlOk && sel.size > 0 && name.trim().length > 0 && !pending;

  return (
    <div className="flex flex-col gap-5">
      {(!ready || !urlOk) && (
        <p className="tip">
          {!ready ? "Brevo n'est pas configuré : ajoute BREVO_API_KEY (.env et Vercel). " : ""}
          {!urlOk ? "Ajoute APP_URL (l'adresse https:// du CRM) : elle sert au lien de désinscription mis dans chaque mail. " : ""}
          Les envois sont bloqués tant que ce n&apos;est pas fait.
        </p>
      )}
      <Card title="Nouvelle campagne" actions={<span className="text-xs text-subtle-fg">Envoi depuis {fromEmail} · {sentToday}/{dailyLimit} mails aujourd&apos;hui</span>}>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap gap-3">
            <input className="input min-w-[220px] flex-1" placeholder="Nom de la campagne (ex. Avocats Île-de-France)" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Nom de la campagne" />
            <select className="input" value={offer} onChange={(e) => setOffer(e.target.value as OfferKey)} aria-label="Offre">
              {offers.map((o) => (
                <option key={o} value={o}>{OFFER_KIT[o].l}</option>
              ))}
            </select>
            <input className="input min-w-[180px]" placeholder="Filtrer la liste…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrer" />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <button type="button" className="btn btn-sec btn-sm" onClick={() => setSel(new Set([...sel, ...shown.map((p) => p.id)]))}>Tout sélectionner ({shown.length})</button>
            <button type="button" className="btn btn-sec btn-sm" onClick={() => setSel(new Set())}>Tout désélectionner</button>
            <span className="text-muted-fg">{eligible.length} entreprise(s) éligible(s){excluded ? ` · ${excluded} exclue(s) (pas d'e-mail, perdue, désinscrite, déjà en campagne ou avancée)` : ""}</span>
          </div>
          <div className="max-h-[320px] overflow-auto rounded-lg border border-border">
            {eligible.length === 0 ? (
              <p className="p-4 text-[13px] text-muted-fg">Aucune entreprise éligible. Il faut une adresse e-mail : utilise « Compléter les fiches » dans Entreprises.</p>
            ) : (
              <table className="w-full">
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id} className="tr">
                      <td className="td w-8"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Sélectionner ${p.name}`} /></td>
                      <td className="td font-medium">{p.name}</td>
                      <td className="td text-muted-fg">{p.sector}</td>
                      <td className="td text-muted-fg">{p.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-pri"
              disabled={!canLaunch}
              onClick={() => {
                const first = Math.min(sel.size, left);
                if (!window.confirm(`Lancer « ${name.trim()} » pour ${sel.size} entreprise(s) ?\n\nPremier lot : ${first} mail(s) tout de suite, le reste étalé sur ~${days} jour(s) (plafond ${dailyLimit}/jour). Les relances partent automatiquement à J+3, J+7 et J+14.`)) return;
                run(() => createCampaignAction(name, offer, [...sel]), () => { setSel(new Set()); setName(""); });
              }}
            >
              <Icon name="mail" />
              {pending ? "Envoi en cours…" : `Lancer la campagne (${sel.size})`}
            </button>
            {sel.size > 0 && <span className="text-xs text-muted-fg">Premier lot : {Math.min(sel.size, left)} mail(s) · fin du J0 vers le {days} jour(s) · plafond {dailyLimit}/jour (MAIL_DAILY_LIMIT)</span>}
          </div>
        </div>
      </Card>

      <Card
        title="Campagnes"
        actions={
          <button type="button" className="btn btn-sec btn-sm" disabled={pending || !ready || !urlOk} onClick={() => run(runCampaignsNowAction)}>
            <Icon name="mail" />
            Envoyer le lot du jour maintenant
          </button>
        }
      >
        {campaigns.length === 0 ? (
          <p className="p-5 text-[13px] text-muted-fg">Aucune campagne pour l&apos;instant. Les envois suivants partent ensuite tout seuls chaque jour ouvré (Vercel Cron), sans rien cliquer.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle">
            {campaigns.map((c) => {
              const n = (s: string) => c.items.filter((i) => i.status === s).length;
              return (
                <details key={c.id} className="p-5">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                    <strong>{c.name}</strong>
                    <span className="text-xs text-muted-fg">{OFFER_KIT[c.offer as OfferKey]?.l ?? c.offer} · {STATUS[c.status] ?? c.status}</span>
                    <span className="text-xs text-muted-fg">{n("en_cours")} en cours · {n("termine")} terminée(s) · {n("arrete")} arrêtée(s){c.items.some((i) => i.error) ? ` · ${c.items.filter((i) => i.error).length} en erreur` : ""}</span>
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.status === "active" && <button type="button" className="btn btn-sec btn-sm" disabled={pending} onClick={() => run(() => setCampaignStatusAction(c.id, "pause"))}>Mettre en pause</button>}
                    {c.status === "pause" && <button type="button" className="btn btn-sec btn-sm" disabled={pending} onClick={() => run(() => setCampaignStatusAction(c.id, "active"))}>Reprendre</button>}
                    {c.status !== "terminee" && <button type="button" className="btn btn-sec btn-sm" disabled={pending} onClick={() => window.confirm("Terminer la campagne ? Les relances restantes seront annulées.") && run(() => setCampaignStatusAction(c.id, "terminee"))}>Terminer</button>}
                  </div>
                  <table className="mt-3 w-full">
                    <thead>
                      <tr><th className="th">Entreprise</th><th className="th">Prochain mail</th><th className="th">État</th><th className="th" /></tr>
                    </thead>
                    <tbody>
                      {c.items.map((i) => (
                        <tr key={i.id} className="tr">
                          <td className="td">{i.company}</td>
                          <td className="td num text-muted-fg">{i.status === "en_cours" ? `${STEP_LABELS[i.step]} · ${fd(i.due)}` : "—"}</td>
                          <td className="td text-muted-fg">{i.status === "en_cours" ? (i.error ? `Erreur : ${i.error}` : "En cours") : i.reason || (i.status === "termine" ? "Terminée" : "Arrêtée")}</td>
                          <td className="td text-right">
                            {i.status === "en_cours" && (
                              <>
                                <button type="button" className="btn btn-sec btn-sm" disabled={pending} onClick={() => run(() => stopItemAction(i.id, "reponse"))}>A répondu</button>{" "}
                                <button type="button" className="btn btn-sec btn-sm" disabled={pending} onClick={() => window.confirm(`Désinscrire ${i.company} de toute campagne ?`) && run(() => stopItemAction(i.id, "desinscrit"))}>Stop</button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
