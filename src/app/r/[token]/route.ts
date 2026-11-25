import { and, desc, eq, gte, like } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { parseChecks } from "@/lib/diagnostic";
import { renderReport } from "@/lib/diagnostic-report";
import { today } from "@/lib/format";
import { isHumanView, readReportToken, REPORT_VIEWED } from "@/lib/report-link";
import { logEvent } from "@/server/core";
import { getProfile } from "@/server/queries";
import { reportCta } from "@/server/report-link";

export const dynamic = "force-dynamic";

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
};

const gone = () =>
  new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Lien expiré</title><body style="font:15px system-ui;max-width:560px;margin:60px auto;padding:0 16px"><h1 style="font-size:20px">Ce lien n'est plus valable</h1><p>Le lien de cette synthèse a expiré ou est incomplet. Répondez simplement au mail reçu : une version à jour vous sera envoyée.</p></body></html>`, { status: 404, headers: HEADERS });

/** Rapport de diagnostic d'une page, ouvert par le prospect depuis le lien signé de son mail. Données publiques seulement. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const secret = (process.env.AUTH_SECRET || "").trim();
  const { token } = await ctx.params;
  const id = secret.length >= 16 ? readReportToken(secret, token, Date.now()) : null;
  if (!id) return gone();
  const d = (await db.select().from(schema.companyDiagnostics).where(eq(schema.companyDiagnostics.id, id)).limit(1))[0];
  if (!d || d.status !== "fait") return gone();
  const c = (await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, d.companyId)).limit(1))[0];
  if (!c) return gone();
  const p = await getProfile();
  const html = renderReport({ company: c.name, mailDomain: d.mailDomain, webHost: d.webHost, checkedOn: d.checkedOn, rulesVersion: d.rulesVersion, checks: parseChecks(d.findings), author: p.me, authorCompany: p.company, authorContact: [p.email, p.phone].filter(Boolean).join(" · "), cta: await reportCta(d.findings) });
  try {
    await recordView(d.companyId, req);
  } catch (e) {
    console.error("rapport : consultation non enregistrée", e);
  }
  return new Response(html, { headers: HEADERS });
}

/** Une consultation par jour au plus dans le journal de la fiche ; robots et ouvertures immédiates écartés. */
async function recordView(companyId: string, req: NextRequest) {
  const last = (await db.select({ at: schema.mailSends.createdAt }).from(schema.mailSends).where(eq(schema.mailSends.companyId, companyId)).orderBy(desc(schema.mailSends.createdAt)).limit(1))[0];
  const since = last ? Math.floor((Date.now() - last.at.getTime()) / 1000) : null;
  if (!isHumanView(req.headers.get("user-agent") ?? "", req.method, since)) return;
  const dayStart = new Date(`${today()}T00:00:00`);
  const already = (await db.select({ id: schema.events.id }).from(schema.events).where(and(eq(schema.events.companyId, companyId), like(schema.events.text, `${REPORT_VIEWED}%`), gte(schema.events.createdAt, dayStart))).limit(1))[0];
  if (already) return;
  await db.transaction(async (tx) => {
    await logEvent(tx, companyId, "note", `${REPORT_VIEWED}. À appeler en priorité.`);
    // Pas d'appel déjà prévu : on en met un aujourd'hui, en tête de la file.
    const open = (await tx.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.companyId, companyId), eq(schema.tasks.kind, "appel"), eq(schema.tasks.done, false))).limit(1))[0];
    if (open) return;
    const co = (await tx.select({ name: schema.companies.name, stage: schema.companies.stage }).from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1))[0];
    if (!co || co.stage === "perdu" || co.stage === "gagne") return;
    const cts = await tx.select({ phone: schema.contacts.phone, isPrimary: schema.contacts.isPrimary }).from(schema.contacts).where(eq(schema.contacts.companyId, companyId));
    const phone = cts.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).find((c) => c.phone.replace(/\D/g, "").length >= 9)?.phone ?? "";
    await tx.insert(schema.tasks).values({ title: `Appeler ${co.name}${phone ? ` au ${phone}` : ""} : a consulté la synthèse de diagnostic`.slice(0, 300), companyId, dueDate: today(), priority: "haute", kind: "appel" });
  });
}
