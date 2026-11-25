import "server-only";
import { today } from "@/lib/format";
import { composeWeeklyReport } from "@/lib/weekly-report";
import { brevoReady, sendBrevoMail } from "./brevo";
import { prospectRecords } from "./campaign-report";
import { getProfile, pilotsSigned } from "./queries";

export type WeeklyRun = { ok: boolean; sent: boolean; message: string };

/** Destinataire : REPORT_TO_EMAIL, sinon l'adresse du profil du CRM. */
async function recipient(): Promise<string> {
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
    const report = composeWeeklyReport(await prospectRecords(), today(), await pilotsSigned());
    const r = await sendBrevoMail({ to: { email: to }, subject: report.subject, text: report.text, tags: ["rapport-hebdo"] });
    return r.ok ? { ok: true, sent: true, message: "Rapport envoyé." } : { ok: false, sent: false, message: r.error };
  } catch (e) {
    return { ok: false, sent: false, message: e instanceof Error ? e.message.slice(0, 300) : "Rapport impossible." };
  }
}
