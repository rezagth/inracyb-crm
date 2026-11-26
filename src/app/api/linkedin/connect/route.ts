import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeUrl, makeState, STATE_TTL_MS } from "@/lib/linkedin";
import { linkedinConfigured, linkedinRedirectUri } from "@/server/linkedin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** « Connecter LinkedIn » : code de sécurité dans un cookie, puis direction l'écran d'autorisation de LinkedIn. */
export async function GET() {
  await requireUser();
  const redirect = linkedinRedirectUri();
  if (!linkedinConfigured() || !redirect) return NextResponse.redirect(new URL("/marketing?linkedin=config", redirect || "http://localhost:3000"));
  const state = makeState(process.env.AUTH_SECRET!.trim(), Date.now());
  const res = NextResponse.redirect(authorizeUrl(process.env.LINKEDIN_CLIENT_ID!.trim(), redirect, state));
  res.cookies.set("li_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/linkedin", maxAge: STATE_TTL_MS / 1000 });
  return res;
}
