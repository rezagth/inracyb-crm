import "server-only";
import { revalidatePath } from "next/cache";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDaysIso, REPLIED_REASON } from "@/lib/campaign";
import { today } from "@/lib/format";
import { scripts } from "@/lib/prospection";
import { buildReplyDraft, classifyInbound, matchCompany, parseAddress, type Inbound } from "@/lib/replies";
import { logEvent } from "./core";
import { recordOptout } from "./campaigns";
import { gmailConfig, listRecentInbound } from "./gmail";
import { getProfile } from "./queries";

/** Un prospect qui répond dans ce délai après notre dernier mail est considéré comme répondant à la campagne. */
export const REPLY_WINDOW_DAYS = 45;

/**
 * Réponse reçue : arrête toute séquence en cours de l'entreprise, le note au journal, crée la tâche et, pour une vraie
 * réponse, dépose un brouillon de réponse dans le journal de la fiche. Sert au bouton « Réponse reçue » et à la lecture automatique.
 * « refus » : réponse négative apparente, tâche de vérification à faible priorité (un refus peut cacher un besoin).
 */
export async function registerReply(companyId: string, kind: "reponse" | "refus" = "reponse"): Promise<{ ok: true; name: string } | { ok: false }> {
  const c = (await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1))[0];
  if (!c) return { ok: false };
  const t = today();
  const title = kind === "refus" ? `Vérifier la réponse de ${c.name} (refus apparent)` : `Répondre à ${c.name} (réponse à une campagne)`;
  let draft = "";
  if (kind === "reponse") {
    const profile = await getProfile();
    const ct = (await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, companyId)).orderBy(desc(schema.contacts.isPrimary)).limit(1))[0];
    const diag = (await db.select({ mail: schema.companyDiagnostics.mailDomain, web: schema.companyDiagnostics.webHost }).from(schema.companyDiagnostics).where(and(eq(schema.companyDiagnostics.companyId, companyId), eq(schema.companyDiagnostics.status, "fait"))).orderBy(desc(schema.companyDiagnostics.createdAt)).limit(1))[0];
    const prospect = { name: c.name, sector: "", contact: ct?.firstName ?? "", role: "", email: ct?.email ?? "", phone: ct?.phone ?? "" };
    draft = buildReplyDraft({ prenom: /^standard$/i.test(ct?.firstName ?? "") ? "" : ct?.firstName ?? "", domain: diag?.mail || diag?.web || "", me: profile.me, signature: scripts(prospect, "audit", profile).x.sig, calUrl: profile.calUrl });
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.mailCampaignItems).set({ status: "arrete", stopReason: REPLIED_REASON, lastError: "" }).where(and(eq(schema.mailCampaignItems.companyId, companyId), eq(schema.mailCampaignItems.status, "en_cours")));
    await logEvent(tx, companyId, "mail", kind === "refus" ? "Réponse négative apparente reçue : relances de campagne arrêtées." : "Réponse reçue : relances de campagne arrêtées.");
    if (draft) await logEvent(tx, companyId, "note", `Brouillon de réponse (à relire, joindre la synthèse d'une page) :\n\n${draft}`);
    if (!(await tx.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.title, title), eq(schema.tasks.done, false))).limit(1))[0]) await tx.insert(schema.tasks).values({ title, companyId, dueDate: t, priority: kind === "refus" ? "basse" : "haute" });
  });
  revalidatePath("/campagnes");
  revalidatePath(`/entreprises/${companyId}`);
  revalidatePath("/", "layout");
  return { ok: true, name: c.name };
}

/**
 * Annule une réponse enregistrée par erreur (bouton « Réponse reçue » cliqué à tort) : la séquence reprend là où elle s'était
 * arrêtée, au plus tôt aujourd'hui, et les tâches « Répondre à… » ou « Vérifier la réponse… » encore ouvertes sont closes.
 */
export async function undoReply(companyId: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const c = (await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1))[0];
  if (!c) return { ok: false, error: "Entreprise introuvable." };
  const items = schema.mailCampaignItems;
  if ((await db.select({ id: items.id }).from(items).where(and(eq(items.companyId, companyId), eq(items.status, "en_cours"))).limit(1))[0]) return { ok: false, error: "Une séquence est déjà en cours pour cette entreprise." };
  const stopped = (await db.select().from(items).where(and(eq(items.companyId, companyId), eq(items.status, "arrete"), eq(items.stopReason, REPLIED_REASON))).orderBy(desc(items.createdAt)).limit(1))[0];
  if (!stopped) return { ok: false, error: "Aucune réponse à annuler pour cette entreprise." };
  const t = today();
  await db.transaction(async (tx) => {
    await tx.update(items).set({ status: "en_cours", stopReason: "", lastError: "", nextDue: stopped.nextDue > t ? stopped.nextDue : t }).where(eq(items.id, stopped.id));
    await logEvent(tx, companyId, "mail", "Réponse annulée (marquée par erreur) : relances de campagne reprises.");
    await tx.update(schema.tasks).set({ done: true }).where(and(eq(schema.tasks.companyId, companyId), eq(schema.tasks.done, false), inArray(schema.tasks.title, [`Répondre à ${c.name} (réponse à une campagne)`, `Vérifier la réponse de ${c.name} (refus apparent)`])));
  });
  revalidatePath("/campagnes");
  revalidatePath(`/entreprises/${companyId}`);
  revalidatePath("/", "layout");
  return { ok: true, name: c.name };
}

export type ReplyRun = { ok: boolean; checked: number; replies: number; refus: number; optouts: number; ignored: number; message: string };

/** Adresses de l'utilisateur : ses propres messages ne sont jamais des réponses de prospects. */
export function ownAddresses(extra: string[] = []): string[] {
  return [process.env.MAIL_FROM_EMAIL || "contact@infracyb.fr", process.env.MAIL_REPLY_TO || "", ...extra].map((a) => a.trim().toLowerCase()).filter(Boolean);
}

/**
 * Applique à la base une liste de messages reçus. Chaque message n'est traité qu'une fois (type « reply » dans mail_events).
 * Un message est une réponse de campagne seulement si son expéditeur est un contact d'une entreprise à qui on a écrit
 * dans les 45 derniers jours, et s'il est arrivé après le premier envoi.
 */
export async function processInbound(inbound: Inbound[], own: string[] = ownAddresses()): Promise<ReplyRun> {
  const run: ReplyRun = { ok: true, checked: inbound.length, replies: 0, refus: 0, optouts: 0, ignored: 0, message: "" };
  if (!inbound.length) return { ...run, message: "Aucun message à examiner." };
  const seen = new Set<string>();
  const ids = inbound.map((m) => m.id);
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await db.select({ d: schema.mailEvents.detail }).from(schema.mailEvents).where(and(eq(schema.mailEvents.type, "reply"), inArray(schema.mailEvents.detail, ids.slice(i, i + 100))));
    for (const r of rows) seen.add(r.d);
  }
  const fresh = inbound.filter((m) => !seen.has(m.id));
  if (!fresh.length) return { ...run, message: "Aucun nouveau message." };
  const contacts = (await db.select({ companyId: schema.contacts.companyId, email: schema.contacts.email }).from(schema.contacts)).filter((c) => c.email.trim());
  const since = addDaysIso(today(), -REPLY_WINDOW_DAYS);
  // detail = identifiant du message (clé de déduplication) ; le motif du classement n'est pas conservé.
  const record = async (email: string, id: string) => { await db.insert(schema.mailEvents).values({ email, type: "reply", detail: id, service: "" }); };
  for (const m of fresh) {
    const sender = parseAddress(m.from);
    const cls = classifyInbound(m, own);
    const companyId = cls.kind === "ignore" ? null : matchCompany(sender, contacts);
    if (!companyId) {
      run.ignored++;
      // Un message automatique est noté pour ne pas être réexaminé ; un inconnu reste réexaminable tant qu'il est dans la fenêtre.
      if (cls.kind === "ignore" && sender) await record(sender, m.id).catch(() => undefined);
      continue;
    }
    const sends = await db.select({ on: schema.mailSends.sentOn, at: schema.mailSends.createdAt }).from(schema.mailSends).where(and(eq(schema.mailSends.companyId, companyId), gte(schema.mailSends.sentOn, since))).orderBy(schema.mailSends.createdAt);
    const first = sends[0]?.at?.getTime();
    if (!sends.length || (m.receivedAt && first && m.receivedAt < first)) {
      run.ignored++;
      continue;
    }
    if (cls.kind === "optout") {
      await recordOptout(sender, "réponse reçue", "Désinscrit (demande par réponse)");
      await logEvent(db, companyId, "mail", "Demande de ne plus être contactée reçue par réponse : adresse désinscrite, relances arrêtées.");
      run.optouts++;
    } else if (cls.kind === "refus") {
      await registerReply(companyId, "refus");
      run.refus++;
    } else {
      await registerReply(companyId, "reponse");
      run.replies++;
    }
    await record(sender, m.id);
  }
  const parts = [`${run.checked} message(s) examiné(s)`, run.replies ? `${run.replies} réponse(s)` : "", run.refus ? `${run.refus} refus apparent(s)` : "", run.optouts ? `${run.optouts} désinscription(s)` : ""].filter(Boolean);
  run.message = parts.join(" · ");
  return run;
}

/** Lecture de Gmail puis traitement. Sans configuration Gmail, ne fait rien (ce n'est pas une erreur : le bouton manuel reste disponible). */
export async function processReplies(): Promise<ReplyRun> {
  const none = (message: string, ok = true): ReplyRun => ({ ok, checked: 0, replies: 0, refus: 0, optouts: 0, ignored: 0, message });
  if (!gmailConfig()) return none("Lecture des réponses non configurée (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN) : utilise le bouton « Réponse reçue ».");
  try {
    const profile = await getProfile();
    return await processInbound(await listRecentInbound(), ownAddresses([profile.email]));
  } catch (e) {
    return none(e instanceof Error ? e.message.slice(0, 300) : "Lecture des réponses impossible.", false);
  }
}
