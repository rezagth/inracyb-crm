import { NextResponse, type NextRequest } from "next/server";
import { isFrenchHoliday } from "@/lib/campaign";
import { today } from "@/lib/format";
import { cronAuthorized } from "@/server/cron-auth";
import { runFeed } from "@/server/feed";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Déclenché chaque jour ouvré par Vercel Cron, avant les diagnostics et les envois : cherche, importe, complète, diagnostique
 * et inscrit des entreprises dans les campagnes permanentes. Ne fait rien si l'interrupteur de la page Alimentation est sur « arrêt ».
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (isFrenchHoliday(today())) return NextResponse.json({ ok: true, ran: false, message: "Jour férié : pas d'alimentation aujourd'hui." });
  const r = await runFeed({ source: "cron", budgetMs: 50_000 });
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
