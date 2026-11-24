import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/db";
import { EMAIL_RE } from "@/lib/brevo";
import { BILLING_SERVICE, billingEventTask, classifyBrevoEvent, isBillingMail } from "@/lib/brevo-events";
import { today } from "@/lib/format";
import { and, eq } from "drizzle-orm";
import { serviceFromTags } from "@/lib/campaign";
import { checkServicePauses, recordOptout, serviceOfLastSend } from "@/server/campaigns";

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
      // Mail de facturation : noté à part, jamais compté contre la prospection ni désinscrit ; un problème donne une tâche.
      if (isBillingMail(o.tags ?? o.tag)) {
        await db.insert(schema.mailEvents).values({ email, type: c.kind, detail, service: BILLING_SERVICE });
        const title = billingEventTask(c.kind, email, typeof o.subject === "string" ? o.subject : "");
        if (title) {
          const t = title.slice(0, 200);
          const open = (await db.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.title, t), eq(schema.tasks.done, false))).limit(1))[0];
          if (!open) await db.insert(schema.tasks).values({ title: t, dueDate: today(), priority: "haute" });
        }
        continue;
      }
      const service = serviceFromTags(o.tags ?? o.tag) ?? (await serviceOfLastSend(email)) ?? "";
      await db.insert(schema.mailEvents).values({ email, type: c.kind, detail, service });
      if (c.suppress) await recordOptout(email, "brevo:" + c.kind, c.reason);
      handled++;
    }
    // Rebond ou plainte : on réévalue tout de suite la pause automatique de chaque service.
    if (handled) await checkServicePauses();
  } catch (e) {
    console.error("webhook Brevo : traitement échoué", e);
    return NextResponse.json({ error: "Erreur de traitement" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, handled });
}
