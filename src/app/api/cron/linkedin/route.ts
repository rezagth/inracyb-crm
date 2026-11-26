import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/server/cron-auth";
import { sendPostReminder } from "@/server/post-reminder";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Mardi et jeudi vers 7 h (heure de Paris) : le post LinkedIn du jour, texte et image, par mail au propriétaire. */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const r = await sendPostReminder();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
