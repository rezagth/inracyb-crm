/**
 * Contexte de la tâche programmée qui écrit les posts LinkedIn (phase T), en JSON sur la sortie standard.
 * Lecture seule : stock de posts programmés, prochaines dates et leurs thèmes, sujets récents, base de faits
 * (dont le baromètre recalculé en direct) et consignes d'écriture. N'affiche aucun nom d'entreprise ni domaine.
 *   npm run -s posts:context
 */
import { loadEnv } from "./load-env";

loadEnv();
import Module from "node:module";
const origLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return origLoad.call(this, request, ...rest);
};

async function main() {
  const { db, schema } = await import("../src/db");
  const { desc, eq } = await import("drizzle-orm");
  const { today } = await import("../src/lib/format");
  const g = await import("../src/lib/post-generator");
  const t = today();
  const posts = await db.select({ date: schema.posts.date, topic: schema.posts.topic, status: schema.posts.status, network: schema.posts.network }).from(schema.posts).orderBy(desc(schema.posts.date));
  const linkedin = posts.filter((p) => p.network === "LinkedIn");
  const ahead = linkedin.filter((p) => p.status === "programme" && p.date >= t);
  const diags = await db.select({ companyId: schema.companyDiagnostics.companyId, findings: schema.companyDiagnostics.findings, checkedOn: schema.companyDiagnostics.checkedOn, mailDomain: schema.companyDiagnostics.mailDomain }).from(schema.companyDiagnostics).where(eq(schema.companyDiagnostics.status, "fait")).orderBy(desc(schema.companyDiagnostics.createdAt));
  const latest = new Map<string, (typeof diags)[number]>();
  for (const d of diags) if (d.mailDomain && !latest.has(d.companyId)) latest.set(d.companyId, d);
  const barometre = g.barometreFrom([...latest.values()]);
  const facts = [...g.barometreFacts(barometre), ...g.CYBER_FACTS, ...g.OFFER_FACTS];
  const needed = ahead.length < g.QUEUE_MIN;
  const dates = needed ? g.nextPostDates(t, linkedin.map((p) => p.date), g.BATCH_SIZE) : [];
  console.log(
    JSON.stringify(
      {
        today: t,
        programmedAhead: ahead.length,
        lastProgrammedDate: ahead.map((p) => p.date).sort().at(-1) ?? null,
        generationNeeded: needed,
        rule: `Une série de ${g.BATCH_SIZE} posts est écrite quand il reste moins de ${g.QUEUE_MIN} posts « Programmé » à venir.`,
        dates: dates.map((d) => ({ date: d, theme: g.themeOf(d).name, pillar: g.themeOf(d).pillar, brief: g.themeOf(d).brief })),
        recentTopics: linkedin.slice(0, 60).map((p) => p.topic),
        facts: facts.map((f) => ({ text: f.text, source: f.source })),
        writingRules: g.WRITING_RULES,
        outputFormat: 'Un tableau JSON : [{ "date": "AAAA-MM-JJ", "topic": "sujet court", "pillar": "Expertise | Conseil pratique | Coulisses | Offre", "body": "texte du post", "visual": { "kicker": "...", "big": "...", "sub": "..." } }]',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
