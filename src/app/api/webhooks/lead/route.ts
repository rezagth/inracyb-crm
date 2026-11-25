import { NextResponse, type NextRequest } from "next/server";
import { parseLead, verifyLead } from "@/lib/lead";
import { receiveLead } from "@/server/lead";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Demandes entrantes du site public (test de messagerie, autodiagnostic). Fermée sans LEAD_WEBHOOK_SECRET ;
 * chaque demande est signée par le serveur du site (HMAC de « horodatage.corps », 5 minutes de validité).
 */
export async function POST(req: NextRequest) {
  const secret = (process.env.LEAD_WEBHOOK_SECRET || "").trim();
  if (secret.length < 32) return NextResponse.json({ ok: false, error: "Service indisponible." }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 8_000) return NextResponse.json({ ok: false, error: "Demande trop longue." }, { status: 413 });
  const ts = req.headers.get("x-infracyb-timestamp") ?? "";
  const sig = req.headers.get("x-infracyb-signature") ?? "";
  if (!verifyLead(secret, ts, raw, sig, Date.now())) return NextResponse.json({ ok: false, error: "Signature invalide." }, { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Demande illisible." }, { status: 400 });
  }
  const p = parseLead(body);
  if (!p.ok) return NextResponse.json({ ok: false, error: p.error }, { status: 422 });
  try {
    const r = await receiveLead(p.lead);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (e) {
    console.error("demande entrante : échec", e instanceof Error ? e.message : "");
    return NextResponse.json({ ok: false, error: "Le test n'a pas pu aboutir. Réessayez dans quelques minutes, ou prenez rendez-vous." }, { status: 500 });
  }
}
