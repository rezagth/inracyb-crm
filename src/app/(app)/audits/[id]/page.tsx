import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { CONTROLS, auditScore } from "@/lib/audit";
import { fd } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icon";
import { Panel, Panels } from "@/components/mod/layout";
import { RunButton } from "@/components/mod/cells";
import { auditPlanAction, setAuditStatusAction } from "@/server/actions/clients";
import { Questionnaire } from "./questionnaire";

export const metadata = { title: "Audit" };

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await db.query.audits.findFirst({ where: eq(schema.audits.id, id), with: { company: { columns: { id: true, name: true } } } });
  if (!a) notFound();
  const answers = JSON.parse(a.answers || "{}") as Record<string, string>;
  const notes = JSON.parse(a.notes || "{}") as Record<string, string>;
  const sc = auditScore(answers);
  return (
    <>
      <PageHeader
        title={`Audit — ${a.company.name}`}
        subtitle={`${fd(a.date)} · ${sc.answered} / ${sc.total} points évalués · ${a.status === "termine" ? "terminé" : "en cours"}`}
        back={{ href: "/audits", label: "Audits" }}
        actions={
          <>
            <Link href={`/audits/${a.id}/rapport`} className="btn btn-sec">
              <Icon name="file" />
              Voir le rapport
            </Link>
            <RunButton action={auditPlanAction.bind(null, a.id)} label="Générer le plan d'action" small={false} />
            <RunButton action={setAuditStatusAction.bind(null, a.id, a.status === "termine" ? "en_cours" : "termine")} label={a.status === "termine" ? "Rouvrir l'audit" : "Terminer l'audit"} primary small={false} />
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Questionnaire auditId={a.id} controls={CONTROLS} answers={answers} notes={notes} />
        <aside className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
          <Panels>
            <Panel
              title={`Score global : ${sc.pct} %`}
              rows={Object.entries(sc.cats).map(([k, x]) => ({ l: k, v: x.m ? `${Math.round((x.s / x.m) * 100)} %` : "—", pct: x.m ? (x.s / x.m) * 100 : 0, color: x.m && x.s / x.m >= 0.75 ? "var(--ok-fg)" : x.m && x.s / x.m >= 0.4 ? "var(--warn-fg)" : "var(--ko-fg)" }))}
              note="Oui = 1 point, Partiel = ½, Non = 0. « N/A » n'entre pas dans le calcul."
            />
          </Panels>
        </aside>
      </div>
    </>
  );
}
