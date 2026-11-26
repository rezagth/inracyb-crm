import "server-only";
import { today } from "@/lib/format";
import { composeWeeklyReport } from "@/lib/weekly-report";
import { brevoReady, sendBrevoMail } from "./brevo";
import { prospectRecords } from "./campaign-report";
import { getProfile, pilotsSigned } from "./queries";
import { checkSender } from "./sender-check";
import { leadsSince } from "./lead";
import { composeCallDigest } from "@/lib/call-queue";
import { callQueue } from "./call-queue";
import { appUrl } from "./campaigns";


export type WeeklyRun = { ok: boolean; sent: boolean; message: string };

/** Destinataire : REPORT_TO_EMAIL, sinon l'adresse du profil du CRM. */
export async function recipient(): Promise<string> {
  const env = (process.env.REPORT_TO_EMAIL || "").trim();
  if (env) return env;
  return ((await getProfile()).email || "").trim();
}

/** Calcule le rapport de la semaine et l'envoie par Brevo. Sans Brevo ou sans destinataire, ne fait rien et le dit. */
export async function sendWeeklyReport(): Promise<WeeklyRun> {
  if (!brevoReady()) return { ok: false, sent: false, message: "Brevo n'est pas configuré : rapport non envoyé." };
  try {
    const to = await recipient();
    if (!to) return { ok: false, sent: false, message: "Aucun destinataire : renseigne REPORT_TO_EMAIL ou l'e-mail du profil." };
    const report = composeWeeklyReport(await prospectRecords(), today(), await pilotsSigned(), await checkSender(), await leadsSince(new Date(Date.now() - 7 * 86_400_000)));
    const r = await sendBrevoMail({ to: { email: to }, subject: report.subject, text: report.text, tags: ["rapport-hebdo"] });
    return r.ok ? { ok: true, sent: true, message: "Rapport envoyé." } : { ok: false, sent: false, message: r.error };
  } catch (e) {
    return { ok: false, sent: false, message: e instanceof Error ? e.message.slice(0, 300) : "Rapport impossible." };
  }
}

/** Mail du matin : la file d'appels du jour. Silencieux quand la file est vide ou que Brevo n'est pas configuré. */
export async function sendCallDigest(): Promise<string> {
  if (!brevoReady()) return "";
  try {
    const to = await recipient();
    if (!to) return "";
    const d = composeCallDigest(await callQueue(today()), today(), appUrl());
    if (!d) return "";
    const r = await sendBrevoMail({ to: { email: to }, subject: d.subject, text: d.text, tags: ["appels-du-jour"] });
    return r.ok ? " · mail des appels du jour envoyé" : ` · mail des appels non envoyé (${r.error.slice(0, 80)})`;
  } catch {
    return " · mail des appels non envoyé";
  }
}

