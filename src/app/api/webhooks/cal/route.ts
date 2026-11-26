import { NextResponse, type NextRequest } from "next/server";
import { parseCalBooking, verifyCalSignature } from "@/lib/cal-booking";
import { handleCalBooking } from "@/server/cal-booking";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Réservations Cal.com (création, report, annulation). Fermée sans CAL_WEBHOOK_SECRET ; chaque envoi doit porter
 * l'en-tête X-Cal-Signature-256 (HMAC-SHA256 hexadécimal du corps brut avec ce secret).
 */
export async function POST(req: NextRequest) {
  const secret = (process.env.CAL_WEBHOOK_SECRET || "").trim();
  if (secret.length < 16) return NextResponse.json({ ok: false, error: "Service indisponible." }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 100_000) return NextResponse.json({ ok: false, error: "Corps trop long." }, { status: 413 });
  if (!verifyCalSignature(secret, raw, req.headers.get("x-cal-signature-256"))) return NextResponse.json({ ok: false, error: "Signature invalide." }, { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Corps illisible." }, { status: 400 });
  }
  // Ping de test de Cal.com et événements non suivis : accusés sans effet.
  const booking = parseCalBooking(body);
  if (!booking) return NextResponse.json({ ok: true, ignored: true });
  try {
    const r = await handleCalBooking(booking);
    return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: r.status });
  } catch (e) {
    console.error("réservation Cal : échec", e instanceof Error ? e.message : "");
    return NextResponse.json({ ok: false, error: "Réservation non enregistrée." }, { status: 500 });
  }
}
