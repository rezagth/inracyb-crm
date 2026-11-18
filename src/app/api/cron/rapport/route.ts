import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/server/cron-auth";
import { sendWeeklyReport } from "@/server/weekly-report";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Envoie chaque lundi le bilan de la semaine par mail. Même secret que les autres déclenchements. */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const r = await sendWeeklyReport();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
