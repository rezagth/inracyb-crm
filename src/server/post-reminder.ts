import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { today } from "@/lib/format";
import { composePostMail, parseVisual, postOfDay } from "@/lib/post-visual";
import { brevoReady, sendBrevoMail } from "./brevo";
import { appUrl } from "./campaigns";
import { postImagePng } from "./post-image";
import { recipient } from "./weekly-report";

/**
 * Mail du post LinkedIn du jour (phase Q) : texte prêt à copier et image PNG en pièce jointe, au propriétaire du CRM.
 * Rien quand aucun post n'est prévu aujourd'hui, ou qu'il est déjà publié.
 */
export async function sendPostReminder(): Promise<{ ok: boolean; sent: boolean; message: string }> {
  if (!brevoReady()) return { ok: false, sent: false, message: "Brevo n'est pas configuré : rappel non envoyé." };
  try {
    const to = await recipient();
    if (!to) return { ok: false, sent: false, message: "Aucun destinataire : renseigne REPORT_TO_EMAIL ou l'e-mail du profil." };
    const t = today();
    const post = postOfDay(await db.select().from(schema.posts).where(eq(schema.posts.date, t)), t);
    if (!post) return { ok: true, sent: false, message: "Aucun post LinkedIn à publier aujourd'hui." };
    const mail = composePostMail(post, appUrl());
    const v = parseVisual(post.visual);
    const attachments = v ? [{ name: `linkedin-${post.date}.png`, contentBase64: (await postImagePng(v)).toString("base64") }] : undefined;
    const r = await sendBrevoMail({ to: { email: to }, subject: mail.subject, text: mail.text, tags: ["linkedin"], attachments });
    return r.ok ? { ok: true, sent: true, message: `Rappel envoyé : ${post.topic}` } : { ok: false, sent: false, message: r.error };
  } catch (e) {
    return { ok: false, sent: false, message: e instanceof Error ? e.message.slice(0, 300) : "Rappel impossible." };
  }
}
