import { NextResponse, type NextRequest } from "next/server";
import { isFrenchHoliday } from "@/lib/campaign";
import { today } from "@/lib/format";
import { cronAuthorized } from "@/server/cron-auth";
import { recordRun, runCampaigns, runFailed, type RunSummary } from "@/server/campaigns";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Déclenché chaque jour par Vercel Cron (vercel.json). Vercel envoie « Authorization: Bearer <CRON_SECRET> ». Sans CRON_SECRET, la route refuse tout. */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  // Jour férié : aucun envoi automatique, les mails dus partent au prochain jour ouvré (l'envoi manuel reste possible).
  const r: RunSummary = isFrenchHoliday(today()) ? { ok: true, sent: 0, stopped: 0, errors: 0, waiting: 0, message: "Jour férié : aucun envoi automatique aujourd'hui." } : await runCampaigns();
  await recordRun("cron", r);
  // Statut 500 en cas d'échec : Vercel marque alors le déclenchement en erreur (visible dans Logs / Cron Jobs), et la page Campagnes l'affiche.
  return NextResponse.json({ ok: !runFailed(r), sent: r.sent, stopped: r.stopped, errors: r.errors, waiting: r.waiting, message: r.message }, { status: runFailed(r) ? 500 : 200 });
}
