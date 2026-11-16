import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/server/cron-auth";
import { runDiagnostics } from "@/server/diagnostic";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Déclenché chaque jour ouvré par Vercel Cron : traite la file d'attente des diagnostics dans un budget de temps, le reste au passage suivant. */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const r = await runDiagnostics({ budgetMs: 45_000 });
  return NextResponse.json(r, { status: r.failed > 0 && r.done === 0 ? 500 : 200 });
}
