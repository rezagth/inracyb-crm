import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { today } from "@/lib/format";
import { composePostMail, composePublishedMail, parseVisual, postOfDay, reconnectNotice } from "@/lib/post-visual";
import { brevoReady, sendBrevoMail } from "./brevo";
import { appUrl } from "./campaigns";
import { linkedinStatus, publishToLinkedin } from "./linkedin";
import { postImagePng } from "./post-image";
import { recipient } from "./weekly-report";

/**
 * Post LinkedIn du jour (phases Q et R). Au statut « Programmé » et LinkedIn connecté : publié automatiquement avec son image,
 * puis mail « Publié » avec le lien. Sinon (non connecté, expiré, refus de LinkedIn, post au statut « Rédigé »…) : mail avec
 * le texte et l'image en pièce jointe, pour publier à la main. Rien quand aucun post n'est prévu aujourd'hui.
 */
export async function runLinkedinDay(): Promise<{ ok: boolean; sent: boolean; message: string }> {
  try {
    const t = today();
    const post = postOfDay(await db.select().from(schema.posts).where(eq(schema.posts.date, t)), t);
    if (!post) return { ok: true, sent: false, message: "Aucun post LinkedIn à publier aujourd'hui." };
    const base = appUrl();
    const published = post.status === "programme" ? await publishToLinkedin(post) : { kind: "manuel" as const, reason: `post au statut « ${post.status} » : seul « Programmé » part automatiquement` };
    const notice = reconnectNotice(await linkedinStatus(), base);
    if (!brevoReady()) return { ok: published.kind === "publie", sent: false, message: published.kind === "publie" ? `Publié : ${published.url}` : `Non publié (${published.reason}) ; Brevo non configuré, aucun mail.` };
    const to = await recipient();
    if (!to) return { ok: false, sent: false, message: "Aucun destinataire : renseigne REPORT_TO_EMAIL ou l'e-mail du profil." };
    if (published.kind === "publie") {
      const m = composePublishedMail(post, published.url);
      const r = await sendBrevoMail({ to: { email: to }, subject: m.subject, text: m.text + (notice ? `\n${notice}\n` : ""), tags: ["linkedin"] });
      return { ok: true, sent: r.ok, message: `Publié sur LinkedIn : ${published.url}` };
    }
    const m = composePostMail(post, base);
    const why = `Publication automatique impossible (${published.reason}) : publie-le à la main.`;
    const v = parseVisual(post.visual);
    const attachments = v ? [{ name: `linkedin-${post.date}.png`, contentBase64: (await postImagePng(v)).toString("base64") }] : undefined;
    const r = await sendBrevoMail({ to: { email: to }, subject: m.subject, text: `${why}\n\n${m.text}${notice ? `\n${notice}\n` : ""}`, tags: ["linkedin"], attachments });
    return r.ok ? { ok: true, sent: true, message: `Mail manuel envoyé : ${published.reason}` } : { ok: false, sent: false, message: r.error };
  } catch (e) {
    return { ok: false, sent: false, message: e instanceof Error ? e.message.slice(0, 300) : "Échec du post du jour." };
  }
}
