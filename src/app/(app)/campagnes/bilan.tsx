"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { rate, type ReportRow, type Verdict } from "@/lib/campaign-report";

export type BilanView = { key: string; label: string; note: string; rows: ReportRow[]; verdicts: Verdict[] };

/** Bilan par service et par segment : tout, puis les cohortes à J+14 et J+30. Les comparaisons ne concluent pas sur un petit échantillon. */
export function Bilan({ views, minSample }: { views: BilanView[]; minSample: number }) {
  const [key, setKey] = useState(views[0]?.key ?? "");
  const v = views.find((x) => x.key === key) ?? views[0];
  if (!v) return null;
  return (
    <Card
      title="Bilan par service et par segment"
      actions={
        <span className="flex gap-2">
          {views.map((x) => (
            <button key={x.key} type="button" className={x.key === v.key ? "btn btn-pri btn-sm" : "btn btn-sec btn-sm"} aria-pressed={x.key === v.key} onClick={() => setKey(x.key)}>{x.label}</button>
          ))}
        </span>
      }
    >
      <div className="flex flex-col gap-3 p-5 text-[13px]">
        <p className="text-muted-fg">{v.note}</p>
        {v.rows.length === 0 ? (
          <p className="text-muted-fg">Aucune entreprise dans ce périmètre pour l&apos;instant.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Service · segment</th><th className="th">Contactées</th><th className="th">Mails</th><th className="th">Délivrées</th><th className="th">Rebonds</th><th className="th">Plaintes</th><th className="th">Désinscr.</th><th className="th">Réponses</th><th className="th">Rendez-vous</th><th className="th">Devis acceptés</th>
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r) => (
                  <tr key={r.service + r.segment} className="tr">
                    <td className="td font-medium">{r.label}{r.contacted < minSample ? <span className="text-xs text-subtle-fg"> · petit échantillon</span> : null}</td>
                    <td className="td num">{r.contacted}</td>
                    <td className="td num text-muted-fg">{r.mails}</td>
                    <td className="td num">{r.delivered === null ? "—" : `${r.delivered} · ${rate(r.delivered, r.contacted)}`}</td>
                    <td className="td num">{r.bounced} · {rate(r.bounced, r.contacted)}</td>
                    <td className="td num">{r.complained} · {rate(r.complained, r.contacted)}</td>
                    <td className="td num">{r.optedOut} · {rate(r.optedOut, r.contacted)}</td>
                    <td className="td num">{r.replied} · {rate(r.replied, r.contacted)}</td>
                    <td className="td num">{r.meetings} · {rate(r.meetings, r.contacted)}</td>
                    <td className="td num">{r.signed} · {rate(r.signed, r.contacted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {v.rows.some((r) => r.delivered === null) && <p className="text-xs text-subtle-fg">Délivrées « — » : Brevo n&apos;a transmis aucun accusé de remise. Coche l&apos;événement « Délivré » dans le webhook Brevo pour remplir cette colonne.</p>}
        {v.verdicts.length > 0 && (
          <ul className="flex flex-col gap-1">
            {v.verdicts.map((x, i) => (
              <li key={i} className={x.conclusive ? "" : "text-muted-fg"}>{x.text}</li>
            ))}
          </ul>
        )}
        <p className="text-xs text-subtle-fg">Les taux sont calculés sur les entreprises contactées. Une comparaison n&apos;est faite qu&apos;à partir de {minSample} entreprises par ligne, et un écart n&apos;est retenu que s&apos;il dépasse la marge d&apos;incertitude (intervalle de confiance à 95 %).</p>
      </div>
    </Card>
  );
}
