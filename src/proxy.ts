import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/** /api/desabonnement : lien de désinscription des prospects ; /api/cron : appelé par Vercel, protégé par CRON_SECRET. */
const PUBLIC = ["/login", "/setup", "/api/desabonnement", "/api/cron"];

/** Première barrière : toute page hors connexion exige un jeton de session valide.
 *  La vérification complète (utilisateur existant, version de session) est refaite côté serveur. */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = token ? await verifySession(token) : null;
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
