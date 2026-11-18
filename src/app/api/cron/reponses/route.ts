import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/server/cron-auth";
import { processReplies } from "@/server/replies";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Lit les réponses reçues dans Gmail (lecture seule), arrête les séquences concernées et crée les tâches. Même secret que les autres déclenchements. */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const r = await processReplies();
  return NextResponse.json({ ok: r.ok, checked: r.checked, replies: r.replies, refus: r.refus, optouts: r.optouts, message: r.message }, { status: r.ok ? 200 : 500 });
}
