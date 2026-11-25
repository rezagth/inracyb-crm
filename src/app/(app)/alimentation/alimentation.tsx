"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runFeedNowAction, saveFeedSettingsAction, setFeedEnabledAction } from "@/server/actions/feed";
import { Card } from "@/components/ui";
import { useToast } from "@/components/mod/toast";
import { fd } from "@/lib/format";

type Settings = { enabled: boolean; feedDiagnostic: boolean; feedAudit: boolean; feedPrescripteur: boolean; departements: string; effectifs: string[]; importPerSegment: number; placesDaily: number };
type Item = { id: string; companyId: string; company: string; segment: string; stage: string; stageKey: string; reason: string; service: string; movedOn: string };
type Run = { id: string; at: string; source: string; ok: boolean; message: string };
type Result = { ok: true; message: string } | { ok: false; error: string };

const FILTERS: [string, string][] = [["", "Tout"], ["a_completer", "À compléter"], ["a_diagnostiquer", "À diagnostiquer"], ["a_inscrire", "Prêtes"], ["inscrit", "Inscrites"], ["ecarte", "Écartées"]];

export function Alimentation({ settings, sizes, placesReady, placesUsedToday, today, stock, items, runs }: { settings: Settings; sizes: { code: string; label: string }[]; placesReady: boolean; placesUsedToday: number; today: { imported: number; enrolled: number; rejected: number }; stock: { toComplete: number; toDiagnose: number; ready: number; enrolled: number; rejected: number }; items: Item[]; runs: Run[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState(settings);
  const [filter, setFilter] = useState("");
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? r.message : r.error);
      router.refresh();
    });
  const toggleSize = (code: string) => setForm((f) => ({ ...f, effectifs: f.effectifs.includes(code) ? f.effectifs.filter((c) => c !== code) : [...f.effectifs, code] }));
  const shown = items.filter((i) => !filter || i.stageKey === filter);

  return (
    <div className="flex flex-col gap-5">
      <Card
        title={settings.enabled ? "Alimentation en marche" : "Alimentation arrêtée"}
        actions={
          <span className="flex gap-2">
            {settings.enabled && <button type="button" className="btn btn-sec btn-sm" disabled={pending} onClick={() => run(runFeedNowAction)}>{pending ? "Passage en cours…" : "Lancer un passage maintenant"}</button>}
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              className={settings.enabled ? "btn btn-danger btn-sm" : "btn btn-pri btn-sm"}
              disabled={pending}
              onClick={() => (settings.enabled || window.confirm("Mettre l'alimentation en marche ?\n\nChaque jour ouvré, des entreprises dont l'adresse mail et le téléphone sont trouvés seront intégrées et inscrites automatiquement dans les campagnes permanentes, et recevront des mails dans la limite des plafonds.")) && run(() => setFeedEnabledAction(!settings.enabled))}
            >
              {settings.enabled ? "Arrêter l'alimentation" : "Mettre en marche"}
            </button>
          </span>
        }
      >
        <div className="flex flex-col gap-2 p-5 text-[13px]">
          <p className={settings.enabled ? "text-muted-fg" : "tip"}>
            {settings.enabled ? "Passage automatique chaque jour ouvré, avant les diagnostics et les envois. L'arrêt est immédiat : plus aucune recherche, aucun import, aucune inscription. Les séquences déjà commencées continuent ; pour les arrêter aussi, mets la campagne en pause dans Campagnes." : "Rien n'est cherché, importé ni inscrit tant que l'alimentation n'est pas mise en marche."}
          </p>
          <p className="text-muted-fg">
            Aujourd&apos;hui : {today.imported} intégrée(s) avec mail et téléphone · {today.enrolled} inscrite(s) · {today.rejected} écartée(s) · Google Places : {placesReady ? `${placesUsedToday}/${settings.placesDaily} requête(s)` : "non configuré : aucune entreprise ne peut être vérifiée, donc aucune n'est intégrée"}
          </p>
          <p className="text-muted-fg">
            En cours : {stock.toComplete} à compléter · {stock.toDiagnose} à diagnostiquer · {stock.ready} prête(s), en attente de place · Total : {stock.enrolled} inscrite(s), {stock.rejected} écartée(s)
          </p>
        </div>
      </Card>

      <Card title="Réglages">
        <div className="flex flex-col gap-4 p-5 text-[13px]">
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.feedDiagnostic} onChange={(e) => setForm({ ...form, feedDiagnostic: e.target.checked })} /> Alimenter le service Diagnostic (constat certain obligatoire)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.feedAudit} onChange={(e) => setForm({ ...form, feedAudit: e.target.checked })} /> Alimenter le service Audit (partage le plafond de la campagne d&apos;audit en cours)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.feedPrescripteur} onChange={(e) => setForm({ ...form, feedPrescripteur: e.target.checked })} /> Alimenter la campagne Prescripteurs (experts-comptables, avocats, notaires trouvés par la recherche ; textes validés, plafond Prescripteurs)</label>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">Départements (vide = France entière)
              <input className="input min-w-[220px]" value={form.departements} onChange={(e) => setForm({ ...form, departements: e.target.value })} placeholder="75, 92, 69" maxLength={200} />
            </label>
            <label className="flex flex-col gap-1">Entreprises intégrées par jour et par segment
              <input className="input w-28" type="number" min={0} max={200} value={form.importPerSegment} onChange={(e) => setForm({ ...form, importPerSegment: Number(e.target.value) })} />
            </label>
            <label className="flex flex-col gap-1">Requêtes Google Places par jour
              <input className="input w-28" type="number" min={0} max={500} value={form.placesDaily} onChange={(e) => setForm({ ...form, placesDaily: Number(e.target.value) })} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span>Tailles ciblées (salariés) :</span>
            {sizes.map((z) => (
              <label key={z.code} className="flex items-center gap-1"><input type="checkbox" checked={form.effectifs.includes(z.code)} onChange={() => toggleSize(z.code)} /> {z.label}</label>
            ))}
          </div>
          <div>
            <button type="button" className="btn btn-sec" disabled={pending} onClick={() => run(() => saveFeedSettingsAction(form))}>Enregistrer les réglages</button>
          </div>
        </div>
      </Card>

      <Card
        title="Entreprises traitées"
        actions={
          <span className="flex flex-wrap gap-1">
            {FILTERS.map(([k, l]) => (
              <button key={k} type="button" className={filter === k ? "btn btn-pri btn-sm" : "btn btn-sec btn-sm"} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </span>
        }
      >
        {shown.length === 0 ? (
          <p className="p-5 text-[13px] text-muted-fg">Aucune entreprise ici pour l&apos;instant.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full">
              <thead>
                <tr><th className="th">Entreprise</th><th className="th">Segment</th><th className="th">Étape</th><th className="th">Détail</th><th className="th">Depuis le</th></tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.id} className="tr">
                    <td className="td font-medium">{i.companyId ? <Link className="link" href={`/entreprises/${i.companyId}`}>{i.company}</Link> : i.company}</td>
                    <td className="td text-muted-fg">{i.segment}</td>
                    <td className="td">{i.stage}{i.service ? ` · ${i.service === "diagnostic" ? "Diagnostic" : "Audit"}` : ""}</td>
                    <td className="td text-muted-fg">{i.reason || "—"}</td>
                    <td className="td num text-muted-fg">{fd(i.movedOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Journal des passages">
        {runs.length === 0 ? (
          <p className="p-5 text-[13px] text-muted-fg">Aucun passage enregistré.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle text-[13px]">
            {runs.map((r) => (
              <li key={r.id} className="px-5 py-3">
                <span className={r.ok ? "text-muted-fg" : "tip"}>
                  {new Date(r.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })} · {r.source === "cron" ? "automatique" : "manuel"} · {r.ok ? "OK" : "ÉCHEC"} · {r.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
