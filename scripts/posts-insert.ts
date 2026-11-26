/**
 * Ajoute au CRM les posts LinkedIn écrits par la tâche programmée (phase T), après contrôle.
 * Chaque post passe validateGeneratedPost : conforme → « Programmé » (publié automatiquement le jour prévu) ;
 * non conforme → « Rédigé » (jamais publié sans relecture). Rejouable : une date qui a déjà un post est ignorée.
 * Envoie ensuite le récapitulatif par mail (Brevo), sauf avec --dry.
 *   npm run -s posts:insert -- <fichier.json> [--dry]
 */
import { loadEnv } from "./load-env";
import type { GeneratedPost } from "../src/lib/post-generator";

loadEnv();
import Module from "node:module";
const origLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return origLoad.call(this, request, ...rest);
};

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const dry = process.argv.includes("--dry");
  if (!file) throw new Error("Indique le fichier JSON des posts : npm run -s posts:insert -- posts.json");
  const { readFileSync } = await import("node:fs");
  const { db, schema } = await import("../src/db");
  const { today } = await import("../src/lib/format");
  const g = await import("../src/lib/post-generator");
  const { visualJson } = await import("../src/lib/post-visual");
  const { eq, desc } = await import("drizzle-orm");

  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("Le fichier doit contenir un tableau JSON de posts.");
  const t = today();
  const existing = await db.select({ date: schema.posts.date, topic: schema.posts.topic, network: schema.posts.network }).from(schema.posts).orderBy(desc(schema.posts.date));
  const linkedin = existing.filter((p) => p.network === "LinkedIn");
  const dates = g.nextPostDates(t, linkedin.map((p) => p.date), g.BATCH_SIZE * 2);
  const diags = await db.select({ companyId: schema.companyDiagnostics.companyId, findings: schema.companyDiagnostics.findings, checkedOn: schema.companyDiagnostics.checkedOn, mailDomain: schema.companyDiagnostics.mailDomain }).from(schema.companyDiagnostics).where(eq(schema.companyDiagnostics.status, "fait")).orderBy(desc(schema.companyDiagnostics.createdAt));
  const latest = new Map<string, (typeof diags)[number]>();
  for (const d of diags) if (d.mailDomain && !latest.has(d.companyId)) latest.set(d.companyId, d);
  const facts = [...g.barometreFacts(g.barometreFrom([...latest.values()])), ...g.CYBER_FACTS, ...g.OFFER_FACTS];
  const ctx = {
    dates,
    allowed: g.allowedNumbers(facts),
    names: (await db.select({ name: schema.companies.name }).from(schema.companies)).map((c) => c.name),
    recentTopics: linkedin.slice(0, 60).map((p) => p.topic),
  };

  const seen = new Set<string>();
  const ok: { date: string; topic: string }[] = [];
  const held: { date: string; topic: string; errors: string[] }[] = [];
  for (const item of raw as GeneratedPost[]) {
    if (seen.has(item?.date)) continue;
    seen.add(item?.date);
    const errors = g.validateGeneratedPost(item, ctx);
    const status = errors.length ? "redige" : "programme";
    (errors.length ? held : ok).push({ date: item?.date, topic: item?.topic, ...(errors.length ? { errors } : {}) } as never);
    if (dry || !ctx.dates.includes(item.date)) continue;
    await db.insert(schema.posts).values({
      date: item.date,
      network: "LinkedIn",
      topic: item.topic.trim().slice(0, 120),
      pillar: ["Expertise", "Conseil pratique", "Coulisses", "Offre"].includes(item.pillar ?? "") ? item.pillar! : g.themeOf(item.date).pillar,
      status,
      body: item.body.trim(),
      visual: visualJson(item.visual?.kicker ?? "", item.visual?.big ?? "", item.visual?.sub ?? ""),
    });
  }
  const summary = { dry, programmes: ok, enAttenteDeRelecture: held };
  console.log(JSON.stringify(summary, null, 2));

  if (!dry && (ok.length || held.length)) {
    const { brevoReady, sendBrevoMail } = await import("../src/server/brevo");
    const { recipient } = await import("../src/server/weekly-report");
    const { appUrl } = await import("../src/server/campaigns");
    const to = await recipient();
    if (brevoReady() && to) {
      const fmt = (d: string) => d.split("-").reverse().join("/");
      const text = [
        "Bonjour,",
        `${ok.length} nouveau(x) post(s) LinkedIn écrit(s) et programmé(s) : ils partiront tout seuls, du lundi au vendredi, entre 8 h et 9 h.`,
        ok.map((p) => `- ${fmt(p.date)} : ${p.topic}`).join("\n"),
        held.length ? `${held.length} post(s) gardé(s) en « Rédigé » car le contrôle a trouvé un problème (ils ne partiront pas sans toi) :\n${held.map((p) => `- ${fmt(p.date)} : ${p.topic} (${p.errors.join(" ; ")})`).join("\n")}` : "",
        `Pour relire, modifier ou bloquer un post (le passer en « Rédigé ») : ${appUrl() ? `${appUrl()}/marketing` : "page Marketing du CRM"}`,
      ].filter(Boolean).join("\n\n");
      const r = await sendBrevoMail({ to: { email: to }, subject: `${ok.length} nouveaux posts LinkedIn programmés${held.length ? ` · ${held.length} à relire` : ""}`, text, tags: ["linkedin"] });
      console.log(r.ok ? "Mail récapitulatif envoyé." : `Mail non envoyé : ${r.error}`);
    }
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
