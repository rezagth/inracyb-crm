import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/server/cron-auth";
import { runLinkedinDay } from "@/server/post-reminder";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Du lundi au vendredi entre 8 h et 9 h (heure de Paris) : publication automatique du post du jour, sinon mail pour le publier à la main. */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const r = await runLinkedinDay();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
