import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PageHeader } from "@/components/ui";
import { FEED_STAGE_LABEL, type FeedStage } from "@/lib/feed";
import { SEGMENT_LABEL, isSegment } from "@/lib/diagnostic-mails";
import { EFFECTIFS } from "@/lib/prospect-search";
import { feedOverview } from "@/server/feed";
import { Alimentation } from "./alimentation";

export const metadata = { title: "Alimentation" };
export const maxDuration = 60;

export default async function AlimentationPage() {
  const o = await feedOverview();
  const items = await db
    .select({ item: schema.feedItems, company: schema.companies.name })
    .from(schema.feedItems)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.feedItems.companyId))
    .orderBy(desc(schema.feedItems.movedOn), desc(schema.feedItems.createdAt))
    .limit(200);
  // Candidats écartés avant d'entrer dans le CRM (pas de fiche : pas de lien).
  const skipped = await db.select().from(schema.feedSkipped).orderBy(desc(schema.feedSkipped.skippedOn), desc(schema.feedSkipped.createdAt)).limit(200);
  const runs = await db.select().from(schema.feedRuns).orderBy(desc(schema.feedRuns.createdAt)).limit(15);
  const s = o.settings;
  return (
    <>
      <PageHeader title="Alimentation" subtitle="Chaque jour ouvré, le CRM cherche des entreprises dans l'Annuaire des Entreprises et ne fait entrer dans le CRM que celles dont il trouve l'adresse mail publiée sur leur site ET le téléphone. Il les diagnostique puis les inscrit dans la campagne permanente de leur segment, sans dépasser les plafonds d'envoi." />
      <Alimentation
        settings={{ enabled: s.enabled, feedDiagnostic: s.feedDiagnostic, feedAudit: s.feedAudit, feedPrescripteur: s.feedPrescripteur, departements: s.departements, effectifs: s.effectifs.split(",").filter(Boolean), importPerSegment: s.importPerSegment, placesDaily: s.placesDaily }}
        sizes={EFFECTIFS}
        placesReady={o.placesReady}
        placesUsedToday={o.placesUsedToday}
        today={o.today}
        stock={o.stock}
        segments={o.segments.map((x) => ({ label: SEGMENT_LABEL[x.segment], today: x.today, week: x.week }))}
        items={[
          ...items.map(({ item, company }) => ({ id: item.id, companyId: item.companyId, company, segment: isSegment(item.segment) ? SEGMENT_LABEL[item.segment] : item.segment, stage: FEED_STAGE_LABEL[item.stage as FeedStage] ?? item.stage, stageKey: item.stage, reason: item.reason, service: item.service, movedOn: item.movedOn })),
          ...skipped.map((k) => ({ id: "skip-" + k.siren, companyId: "", company: k.name, segment: isSegment(k.segment) ? SEGMENT_LABEL[k.segment] : k.segment, stage: "Écartée, hors CRM", stageKey: "ecarte", reason: k.reason, service: "", movedOn: k.skippedOn })),
        ].sort((a, b) => (a.movedOn < b.movedOn ? 1 : a.movedOn > b.movedOn ? -1 : 0))}
        runs={runs.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), source: r.source, ok: r.ok, message: r.message }))}
      />
    </>
  );
}
