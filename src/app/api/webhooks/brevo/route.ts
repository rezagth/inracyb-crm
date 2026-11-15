import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/db";
import { EMAIL_RE } from "@/lib/brevo";
import { classifyBrevoEvent } from "@/lib/brevo-events";
import { recordOptout } from "@/server/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook Brevo (événements transactionnels : rebond, spam, blocage, adresse invalide, désinscription).
 * Adresse à coller dans Brevo : https://<ton CRM>/api/webhooks/brevo?key=<BREVO_WEBHOOK_SECRET>
 * Sans BREVO_WEBHOOK_SECRET (16 caractères minimum), la route refuse tout.
 */
export async function POST(req: NextRequest) {
  const secret = (process.env.BREVO_WEBHOOK_SECRET || "").trim();
  const given = req.nextUrl.searchParams.get("key") ?? "";
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  if (secret.length < 16 || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  const events = (Array.isArray(body) ? body : [body]).slice(0, 100);
  let handled = 0;
  try {
    for (const ev of events) {
      if (!ev || typeof ev !== "object") continue;
      const o = ev as Record<string, unknown>;
      const c = classifyBrevoEvent(o.event ?? o.type);
      const email = typeof o.email === "string" ? o.email.trim().toLowerCase() : "";
      if (!c || !EMAIL_RE.test(email)) continue;
      const detail = typeof o.reason === "string" ? o.reason.slice(0, 300) : "";
      await db.insert(schema.mailEvents).values({ email, type: c.kind, detail });
      if (c.suppress) await recordOptout(email, "brevo:" + c.kind, c.reason);
      handled++;
    }
  } catch (e) {
    console.error("webhook Brevo : traitement échoué", e);
    return NextResponse.json({ error: "Erreur de traitement" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, handled });
}
