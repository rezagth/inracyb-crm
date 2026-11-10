import Link from "next/link";
import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { getProfile, prospectList } from "@/server/queries";
import { getSettings } from "@/server/core";
import { brevoConfig, brevoReady } from "@/server/brevo";
import { addDays, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icon";
import { EnrichAll } from "@/components/enrich-button";
import { FormButton } from "@/components/mod/record-dialog";
import { Prospection } from "./prospection";

export const metadata = { title: "Prospection" };
/** La recherche d'e-mails lit des sites web : on laisse jusqu'à 60 s à chaque action. */
export const maxDuration = 60;

export default async function ProspectionPage({ searchParams }: { searchParams: Promise<{ co?: string; offer?: string; tab?: string; call?: string }> }) {
  const sp = await searchParams;
  const s = (await getSettings());
  const t = today();
  const prospects = await prospectList();
  const sends = (await db.select({ companyId: schema.mailSends.companyId, offer: schema.mailSends.offer, step: schema.mailSends.step, sentOn: schema.mailSends.sentOn }).from(schema.mailSends));
  const wd = new Date(t + "T12:00:00Z").getUTCDay();
  const monday = addDays(t, -((wd + 6) % 7));
  const counts = {
    calls: (await db.select().from(schema.calls).where(eq(schema.calls.date, t))).length,
    mails: sends.filter((m) => m.sentOn === t).length,
    rdvWeek: (await db.select().from(schema.calls).where(and(eq(schema.calls.result, "RDV obtenu"), gte(schema.calls.date, monday)))).length,
  };
  const offers = s.offers.split(",").filter((x): x is "audit" | "ciso" | "ia" => ["audit", "ciso", "ia"].includes(x));
  return (
    <>
      <PageHeader
        title="Prospection"
        subtitle="Scripts d'appel, séquences de mails et réponses aux objections, écrits pour chaque prospect."
        actions={
          <>
            <Link href="/prospection/recherche" className="btn btn-sec">
              <Icon name="search" />
              Rechercher des prospects
            </Link>
            <EnrichAll ids={prospects.filter((p) => !p.email && (p.stage === "qualif" || p.stage === "contacte")).map((p) => p.id)} />
            <FormButton form="call" label="Noter un appel" icon="phone" companies={prospects.map((p) => ({ id: p.id, name: p.name }))} />
          </>
        }
      />
      <Prospection
        prospects={prospects}
        profile={(await getProfile())}
        offers={offers.length ? offers : ["audit"]}
        targets={s.targetSectors.split(",").filter(Boolean)}
        goals={{ calls: s.goalCalls, mails: s.goalMails, rdv: s.goalRdv }}
        counts={counts}
        sends={sends}
        mailReady={brevoReady()}
        dailyLimit={brevoConfig().dailyLimit}
        fromEmail={brevoConfig().fromEmail}
        initial={{ co: sp.co, offer: sp.offer, tab: sp.tab, call: sp.call === "1" }}
      />
    </>
  );
}
