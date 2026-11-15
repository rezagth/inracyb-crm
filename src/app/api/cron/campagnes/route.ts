import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { recordRun, runCampaigns, runFailed } from "@/server/campaigns";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Déclenché chaque jour par Vercel Cron (vercel.json). Vercel envoie « Authorization: Bearer <CRON_SECRET> ». Sans CRON_SECRET, la route refuse tout. */
export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  if (secret.length < 16 || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const r = await runCampaigns();
  await recordRun("cron", r);
  // Statut 500 en cas d'échec : Vercel marque alors le déclenchement en erreur (visible dans Logs / Cron Jobs), et la page Campagnes l'affiche.
  return NextResponse.json({ ok: !runFailed(r), sent: r.sent, stopped: r.stopped, errors: r.errors, waiting: r.waiting, message: r.message }, { status: runFailed(r) ? 500 : 200 });
}
