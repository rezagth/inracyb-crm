import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { checkState } from "@/lib/linkedin";
import { appUrl, connectLinkedin } from "@/server/linkedin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Retour de LinkedIn : code de sécurité vérifié, jeton échangé et enregistré chiffré, puis retour à la page Marketing. */
export async function GET(req: NextRequest) {
  await requireUser();
  const base = appUrl() || req.nextUrl.origin;
  const back = (r: string) => {
    const res = NextResponse.redirect(new URL(`/marketing?linkedin=${r}`, base));
    res.cookies.set("li_state", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/linkedin", maxAge: 0 });
    return res;
  };
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return back("refus");
  if (!checkState((process.env.AUTH_SECRET || "").trim(), q.get("state"), req.cookies.get("li_state")?.value, Date.now())) return back("securite");
  const code = q.get("code");
  if (!code || code.length > 2000) return back("erreur");
  const r = await connectLinkedin(code);
  return back(r.ok ? "ok" : "erreur");
}
