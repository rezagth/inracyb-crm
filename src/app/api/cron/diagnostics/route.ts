import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/server/cron-auth";
import { runDiagnostics } from "@/server/diagnostic";
import { runFeed } from "@/server/feed";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Déclenché chaque jour ouvré par Vercel Cron : d'abord le stock de l'alimentation (diagnostic puis inscription des
 * entreprises déjà vérifiées), puis le reste de la file d'attente des diagnostics, dans un budget de temps.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const started = Date.now();
  const feed = await runFeed({ source: "cron", budgetMs: 30_000, stockOnly: true });
  const r = await runDiagnostics({ budgetMs: Math.max(12_000, 50_000 - (Date.now() - started)) });
  return NextResponse.json({ ...r, feed: feed.message }, { status: r.failed > 0 && r.done === 0 ? 500 : 200 });
}
