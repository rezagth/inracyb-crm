import { NextResponse, type NextRequest } from "next/server";
import { isFrenchHoliday } from "@/lib/campaign";
import { today } from "@/lib/format";
import { cronAuthorized } from "@/server/cron-auth";
import { runMonthlyChecks } from "@/server/monthly-check";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Chaque jour ouvré : envoie les bilans mensuels du suivi qui sont dus (au premier jour ouvré du mois en pratique). */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (isFrenchHoliday(today())) return NextResponse.json({ ok: true, message: "Jour férié : bilans au prochain jour ouvré." });
  try {
    return NextResponse.json(await runMonthlyChecks());
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message.slice(0, 300) : "Échec" }, { status: 500 });
  }
}
