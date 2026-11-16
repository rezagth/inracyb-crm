import { eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { prospectList } from "@/server/queries";
import { getSettings } from "@/server/core";
import { brevoConfig, brevoReady } from "@/server/brevo";
import { appUrl, checkServicePauses, crossHistories, getDailyState, optoutSet, restDays } from "@/server/campaigns";
import { PAUSE_RULE, entryExclusion, ENTRY_EXCLUSION_LABEL, RAMP_EVERY, serviceOf } from "@/lib/campaign";
import { BOUNCE_REASONS, REASON } from "@/lib/brevo-events";
import { today } from "@/lib/format";
import { siteFromNotes } from "@/lib/contact-extract";
import { DIAGNOSTIC_FRESH_DAYS, hookOf, parseChecks, targetsOf, usableDiagnostic } from "@/lib/diagnostic";
import { HOOK_LABEL, isHookVariant, segmentOfSector } from "@/lib/diagnostic-mails";
import { latestDiagnostics } from "@/server/diagnostic";
import { buildReport, MIN_SAMPLE, verdicts } from "@/lib/campaign-report";
import { prospectRecords } from "@/server/campaign-report";
import { PageHeader } from "@/components/ui";
import { Campagnes } from "./campagnes";

export const metadata = { title: "Campagnes" };
export const maxDuration = 60;

export default async function CampagnesPage() {
  const s = await getSettings();
  const t = today();
  const optouts = await optoutSet();
  const campaigns = await db.select().from(schema.mailCampaigns).orderBy(sql`${schema.mailCampaigns.createdAt} desc`);
  const items = await db
    .select({ item: schema.mailCampaignItems, company: schema.companies.name })
    .from(schema.mailCampaignItems)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.mailCampaignItems.companyId));
  const inCampaign = new Set(items.filter((i) => i.item.status === "en_cours").map((i) => i.item.companyId));
  // Éligibilité vue depuis le service Audit (seul service ouvert à la création pour l'instant).
  const history = await crossHistories("audit");
  const rest = restDays();
  const prospects = (await prospectList()).map((p) => {
    const ex = entryExclusion({ id: p.id, name: p.name, stage: p.stage, email: p.email, emailSource: p.emailSource }, optouts, inCampaign, "audit", history.get(p.id), t, rest);
    return { id: p.id, name: p.name, sector: p.sector, email: p.email, why: ex ? ENTRY_EXCLUSION_LABEL[ex] : null };
  });
  const state = await getDailyState(t);
  // Onglet Diagnostic : entreprises dont le domaine est exploitable, file d'attente et derniers résultats.
  const notes = new Map((await db.select({ id: schema.companies.id, notes: schema.companies.notes }).from(schema.companies)).map((c) => [c.id, c.notes]));
  const all = await prospectList();
  const diagProspects = all.flatMap((p) => {
    if (p.stage === "perdu") return [];
    const tg = targetsOf(p.email, siteFromNotes(notes.get(p.id) ?? ""));
    const target = [...new Set([tg.mailDomain, tg.webHost].filter(Boolean))].join(" · ");
    return target ? [{ id: p.id, name: p.name, sector: p.sector, target }] : [];
  });
  const names = new Map(all.map((p) => [p.id, p.name]));
  const latest = await latestDiagnostics();
  // Entreprises qui peuvent entrer dans une campagne Diagnostic : secteur d'un segment, constat d'accroche récent, règles d'entrée du service.
  const diagHistory = await crossHistories("diagnostic");
  const diagCandidates = all.flatMap((p) => {
    const d = latest.get(p.id);
    const segment = segmentOfSector(p.sector);
    if (!d || !segment || !usableDiagnostic(d, t)) return [];
    const variant = hookOf(parseChecks(d.findings))?.variant ?? "";
    const ex = entryExclusion({ id: p.id, name: p.name, stage: p.stage, email: p.email, emailSource: p.emailSource }, optouts, inCampaign, "diagnostic", diagHistory.get(p.id), t, rest);
    return [{ id: p.id, name: p.name, sector: p.sector, segment, email: p.email, hook: isHookVariant(variant) ? HOOK_LABEL[variant] : "", contact: p.contact, why: ex ? ENTRY_EXCLUSION_LABEL[ex] : null }];
  });
  const diagRows = [...latest.values()].map((d) => {
    const main = parseChecks(d.findings).find((c) => c.id === d.mainFinding);
    return { id: d.id, company: names.get(d.companyId) ?? "", target: [...new Set([d.mailDomain, d.webHost].filter(Boolean))].join(" · "), checkedOn: d.checkedOn, main: main?.label ?? "", mainWording: main?.wording ?? "", certainCount: d.certainCount, usable: usableDiagnostic(d, t) };
  });
  const diagPending = (await db.select({ id: schema.companyDiagnostics.id }).from(schema.companyDiagnostics).where(eq(schema.companyDiagnostics.status, "a_faire"))).length;
  const status = await checkServicePauses();
  const statusOf = (k: "audit" | "diagnostic") => ({ paused: status[k].paused, reason: status[k].reason, ...status[k].health });
  const sends = await db.select({ companyId: schema.mailSends.companyId, offer: schema.mailSends.offer }).from(schema.mailSends);
  const statsOf = (campaignId: string, offer: string) => {
    const its = items.filter((i) => i.item.campaignId === campaignId);
    const ids = new Set(its.map((i) => i.item.companyId));
    const mine = sends.filter((x) => x.offer === offer && ids.has(x.companyId));
    const reasons = its.map((i) => i.item.stopReason);
    const count = (f: (r: string) => boolean) => reasons.filter(f).length;
    return { contacted: new Set(mine.map((x) => x.companyId)).size, mails: mine.length, replies: count((r) => r === "A répondu"), bounces: count((r) => BOUNCE_REASONS.includes(r)), spam: count((r) => r === REASON.spam), optouts: count((r) => r === REASON.desinscrit) };
  };
  // Santé des envois : dernier déclenchement et événements Brevo des 7 derniers jours. Si les tables n'existent pas encore, la page reste utilisable.
  let health: { missing: boolean; lastRun: { at: string; source: string; ok: boolean; message: string } | null; events: Record<string, number> } = { missing: false, lastRun: null, events: {} };
  try {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const run = (await db.select().from(schema.mailRuns).orderBy(sql`${schema.mailRuns.createdAt} desc`).limit(1))[0];
    const ev = await db.select({ type: schema.mailEvents.type, n: sql<number>`count(*)` }).from(schema.mailEvents).where(gte(schema.mailEvents.createdAt, since)).groupBy(schema.mailEvents.type);
    health = { missing: false, lastRun: run ? { at: run.createdAt.toISOString(), source: run.source, ok: run.ok, message: run.message } : null, events: Object.fromEntries(ev.map((e) => [e.type, Number(e.n)])) };
  } catch {
    health = { ...health, missing: true };
  }
  // Bilan : tout, puis les cohortes dont le premier mail date d'au moins 14 et 30 jours.
  const records = await prospectRecords();
  const view = (key: string, label: string, note: string, horizon: 14 | 30 | null) => {
    const rows = buildReport(records, t, horizon);
    return { key, label, note, rows, verdicts: verdicts(rows) };
  };
  const bilan = [
    view("tout", "Tout", "Toutes les entreprises contactées, quel que soit leur avancement dans la séquence.", null),
    view("j14", "À J+14", "Entreprises dont le premier mail date d'au moins 14 jours (séquence terminée) ; rendez-vous et devis des 14 premiers jours.", 14),
    view("j30", "À J+30", "Entreprises dont le premier mail date d'au moins 30 jours ; rendez-vous et devis des 30 premiers jours.", 30),
  ];
  const offers = s.offers.split(",").filter((x): x is "audit" | "ciso" | "ia" => ["audit", "ciso", "ia"].includes(x));
  return (
    <>
      <PageHeader title="Campagnes" subtitle="Envoie une séquence de mails (J0, J+3, J+7, J+14) à plusieurs entreprises d'un coup : le CRM étale les envois et s'arrête tout seul si l'entreprise avance, est perdue ou se désinscrit." />
      <Campagnes
        prospects={prospects}
        offers={offers.length ? offers : ["audit"]}
        ready={brevoReady()}
        urlOk={!!appUrl()}
        dailyLimit={state.audit.limit}
        sentToday={state.audit.sent}
        diagnostic={{ limit: state.diagnostic.limit, sent: state.diagnostic.sent, stage: state.diagnostic.ramp.stage, stages: state.diagnostic.ramp.stages, target: state.diagnostic.ramp.target, every: RAMP_EVERY, firstSendOn: state.diagnostic.firstSendOn }}
        total={{ limit: state.total.limit, sent: state.total.sent }}
        restDays={rest}
        bilan={{ views: bilan, minSample: MIN_SAMPLE }}
        diag={{ prospects: diagProspects, rows: diagRows, pending: diagPending, freshDays: DIAGNOSTIC_FRESH_DAYS, candidates: diagCandidates }}
        status={{ audit: statusOf("audit"), diagnostic: statusOf("diagnostic") }}
        pauseRule={{ windowDays: PAUSE_RULE.windowDays, minSends: PAUSE_RULE.minSends, maxBounceRate: PAUSE_RULE.maxBounceRate }}
        fromEmail={brevoConfig().fromEmail}
        health={health}
        campaigns={campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          offer: c.offer,
          service: serviceOf(c.offer),
          segment: c.segment,
          status: c.status,
          stats: statsOf(c.id, c.offer),
          items: items.filter((i) => i.item.campaignId === c.id).map((i) => ({ id: i.item.id, company: i.company, step: i.item.nextStep, due: i.item.nextDue, status: i.item.status, reason: i.item.stopReason, error: i.item.lastError })),
        }))}
      />
    </>
  );
}
