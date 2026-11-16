"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createCampaignAction, runCampaignsNowAction, setCampaignStatusAction, stopItemAction } from "@/server/actions/campaigns";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/mod/toast";
import { OFFER_KIT, type OfferKey } from "@/lib/prospection";
import { SERVICE_KEYS, SERVICE_LABEL, STEP_LABELS, type ServiceKey } from "@/lib/campaign";
import { fd } from "@/lib/format";

type P = { id: string; name: string; sector: string; email: string; why: string | null };
type Item = { id: string; company: string; step: number; due: string; status: string; reason: string; error: string };
type Stats = { contacted: number; mails: number; replies: number; bounces: number; spam: number; optouts: number };
type Health = { missing: boolean; lastRun: { at: string; source: string; ok: boolean; message: string } | null; events: Record<string, number> };
type C = { id: string; name: string; offer: string; service: ServiceKey; status: string; stats: Stats; items: Item[] };
type Diag = { open: boolean; limit: number; sent: number; stage: number; stages: number[]; target: number; every: number; firstSendOn: string | null };

const STATUS: Record<string, string> = { active: "En cours", pause: "En pause", terminee: "Terminée" };

export function Campagnes({ prospects, offers, ready, urlOk, dailyLimit, sentToday, diagnostic, total, restDays, fromEmail, health, campaigns: allCampaigns }: { prospects: P[]; offers: OfferKey[]; ready: boolean; urlOk: boolean; dailyLimit: number; sentToday: number; diagnostic: Diag; total: { limit: number; sent: number }; restDays: number; fromEmail: string; health: Health; campaigns: C[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<ServiceKey>("audit");
  const campaigns = allCampaigns.filter((c) => c.service === tab);
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
      <Card title="Santé des envois">
        <div className="flex flex-col gap-2 p-5 text-[13px]">
          {health.missing ? (
            <p className="tip">Suivi des rebonds indisponible : colle le fichier drizzle-manuel-suivi.sql dans Neon (SQL Editor), puis recharge la page.</p>
          ) : (
            <>
              {health.lastRun ? (
                <p className={health.lastRun.ok ? "text-muted-fg" : "tip"}>
                  Dernier déclenchement ({health.lastRun.source === "cron" ? "automatique" : "manuel"}) : {new Date(health.lastRun.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })} · {health.lastRun.ok ? "OK" : "ÉCHEC"} · {health.lastRun.message}
                </p>
              ) : (
                <p className="text-muted-fg">Aucun déclenchement enregistré pour l&apos;instant.</p>
              )}
              <p className="text-muted-fg">
                7 derniers jours : {health.events.rebond ?? 0} rebond(s) · {health.events.spam ?? 0} plainte(s) spam · {(health.events.bloque ?? 0) + (health.events.invalide ?? 0)} adresse(s) bloquée(s) ou invalide(s) · {health.events.desinscrit ?? 0} désinscription(s) Brevo
                {Object.keys(health.events).length === 0 ? " (rien reçu : vérifie que le webhook Brevo est configuré)" : ""}
              </p>
            </>
          )}
        </div>
      </Card>

      <div role="tablist" aria-label="Service" className="flex flex-wrap items-center gap-2">
        {SERVICE_KEYS.map((s) => {
          const sent = s === "audit" ? sentToday : diagnostic.sent;
          const limit = s === "audit" ? dailyLimit : diagnostic.limit;
          return (
            <button key={s} type="button" role="tab" aria-selected={tab === s} className={tab === s ? "btn btn-pri btn-sm" : "btn btn-sec btn-sm"} onClick={() => setTab(s)}>
              {SERVICE_LABEL[s]} · {sent}/{limit} aujourd&apos;hui
            </button>
          );
        })}
        <span className="text-xs text-subtle-fg">Total du jour : {total.sent}/{total.limit} · une seule séquence à la fois par entreprise · {restDays} jours de repos avant de passer d&apos;un service à l&apos;autre</span>
      </div>

      {tab === "diagnostic" && (
        <Card title="Service Diagnostic" actions={<span className="text-xs text-subtle-fg">{diagnostic.sent}/{diagnostic.limit} mails aujourd&apos;hui</span>}>
          <div className="flex flex-col gap-2 p-5 text-[13px]">
            <p className="text-muted-fg">
              Montée en charge : {diagnostic.stages.map((n, i) => (i === diagnostic.stage ? `[${n}]` : String(n))).join(" → ")} mails par jour, un palier tous les {diagnostic.every} jours ouvrés à partir du premier envoi réel{diagnostic.target > (diagnostic.stages.at(-1) ?? 0) ? `, puis ${diagnostic.target}` : ""}.
            </p>
            <p className="text-muted-fg">
              Palier du jour : {diagnostic.stage + 1} sur {diagnostic.stages.length} ({diagnostic.limit} mails). {diagnostic.firstSendOn ? `Premier envoi le ${fd(diagnostic.firstSendOn)}.` : "Aucun envoi pour l'instant : la montée démarre au premier mail."}
            </p>
            {!diagnostic.open && <p className="tip">Ce service n&apos;envoie rien pour l&apos;instant : la création de campagne s&apos;ouvrira quand le moteur de constats et les textes des mails seront en place.</p>}
          </div>
        </Card>
      )}

      {tab === "audit" && <Card title="Nouvelle campagne" actions={<span className="text-xs text-subtle-fg">Envoi depuis {fromEmail} · {sentToday}/{dailyLimit} mails aujourd&apos;hui</span>}>
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
            <span className="text-muted-fg">{eligible.length} entreprise(s) éligible(s){excluded ? ` · ${excluded} exclue(s) (pas d'e-mail, perdue, désinscrite, déjà en campagne, avancée ou en délai de repos)` : ""}</span>
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
      </Card>}

      <Card
        title={`Campagnes ${SERVICE_LABEL[tab]}`}
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
                    <span className="text-xs text-muted-fg">{OFFER_KIT[c.offer as OfferKey]?.l ?? (c.offer === "diagnostic" ? "Diagnostic gratuit" : c.offer)} · {STATUS[c.status] ?? c.status}</span>
                    <span className="text-xs text-muted-fg">{n("en_cours")} en cours · {n("termine")} terminée(s) · {n("arrete")} arrêtée(s){c.items.some((i) => i.error) ? ` · ${c.items.filter((i) => i.error).length} en erreur` : ""}</span>
                    <span className="text-xs text-muted-fg">{c.stats.contacted} contactée(s) · {c.stats.mails} mail(s) · {c.stats.replies} réponse(s) · {c.stats.bounces} rebond(s){c.stats.spam ? ` · ${c.stats.spam} plainte(s) spam` : ""}{c.stats.optouts ? ` · ${c.stats.optouts} désinscrit(s)` : ""}</span>
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
