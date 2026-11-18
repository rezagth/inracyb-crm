/**
 * Rapport hebdomadaire : règles pures (sans base ni réseau), donc testables.
 * Il reprend le bilan par service et segment, ajoute ce qui est arrivé cette semaine, les alertes et la prochaine action.
 */
import { addDaysIso } from "./campaign";
import { buildReport, rate, verdicts, type ProspectRecord, type ReportRow } from "./campaign-report";
import { PACK_COURRIER, pilotSlotsLeft } from "./pricing";

export type WeeklyReport = { subject: string; text: string; alerts: string[]; actions: string[] };

const sum = (rows: ReportRow[], k: keyof Pick<ReportRow, "contacted" | "mails" | "bounced" | "complained" | "optedOut" | "replied" | "meetings" | "signed">) => rows.reduce((a, r) => a + r[k], 0);
const frDate = (iso: string) => iso.split("-").reverse().join("/");

/** Seuil de rebonds à partir duquel l'envoi doit être regardé (le moteur se met en pause à plus de 2 %). */
export const BOUNCE_ALERT = 0.02;

export function composeWeeklyReport(records: ProspectRecord[], today: string, pilotsSigned = 0): WeeklyReport {
  const from = addDaysIso(today, -7);
  const week = records.filter((r) => r.firstSend && r.firstSend > from);
  const all = buildReport(records, today, null);
  const weekRows = buildReport(week, today, null);
  const total = { contacted: sum(all, "contacted"), mails: sum(all, "mails"), bounced: sum(all, "bounced"), complained: sum(all, "complained"), optedOut: sum(all, "optedOut"), replied: sum(all, "replied"), meetings: sum(all, "meetings"), signed: sum(all, "signed") };

  const alerts: string[] = [];
  if (total.complained > 0) alerts.push(`${total.complained} plainte(s) pour spam : les envois se mettent en pause d'eux-mêmes. Regarde la campagne concernée avant de relancer.`);
  if (total.contacted >= 20 && total.bounced / total.contacted > BOUNCE_ALERT) alerts.push(`Rebonds à ${rate(total.bounced, total.contacted)} (seuil ${BOUNCE_ALERT * 100} %) : vérifie la qualité des adresses.`);

  const actions: string[] = [];
  const weekNew = sum(weekRows, "contacted");
  if (total.contacted === 0) actions.push("Aucune entreprise n'a encore été contactée : vérifie Brevo (clé, expéditeur validé) et l'alimentation.");
  else if (weekNew === 0) actions.push("Aucun nouvel envoi cette semaine : vérifie que les campagnes ne sont pas en pause et que l'alimentation trouve des entreprises.");
  if (total.replied > 0 && total.meetings === 0) actions.push(`${total.replied} réponse(s) sans rendez-vous : réponds-leur et propose un créneau de 15 minutes.`);
  const left = pilotSlotsLeft(pilotsSigned);
  if (left > 0 && total.contacted > 0) actions.push(`Il reste ${left} place(s) pilote sur ${PACK_COURRIER.pilotSlots} : propose le prix pilote aux entreprises qui répondent.`);
  if (!actions.length) actions.push("Rien d'urgent : continue les appels de J+4 et les réponses.");

  const line = (r: ReportRow) => `- ${r.label} : ${r.contacted} contactée(s), ${r.replied} réponse(s) (${rate(r.replied, r.contacted)}), ${r.meetings} rendez-vous, ${r.signed} devis accepté(s), ${r.optedOut} désinscription(s), ${r.bounced} rebond(s), ${r.complained} plainte(s)`;
  const conclusive = verdicts(all).filter((v) => v.conclusive);

  const text = [
    `Bilan de la semaine du ${frDate(from)} au ${frDate(today)}`,
    "",
    `Cette semaine : ${weekNew} nouvelle(s) entreprise(s) contactée(s)${weekRows.length ? " (" + weekRows.map((r) => `${r.label} : ${r.contacted}`).join(" ; ") + ")" : ""}.`,
    "",
    "Depuis le début :",
    ...(all.length ? all.map(line) : ["- Aucun envoi pour l'instant."]),
    all.length ? `Total : ${total.contacted} contactée(s), ${total.replied} réponse(s), ${total.meetings} rendez-vous, ${total.signed} devis accepté(s).` : "",
    "",
    alerts.length ? "À regarder :" : "",
    ...alerts.map((a) => "- " + a),
    alerts.length ? "" : "",
    "Ce qui compte cette semaine :",
    ...actions.map((a) => "- " + a),
    "",
    conclusive.length ? "Ce que les chiffres permettent de conclure :" : "Comparaisons : pas assez de données pour conclure (minimum 30 entreprises par ligne).",
    ...conclusive.map((v) => "- " + v.text),
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();

  return { subject: `InfraCyb · bilan de la semaine du ${frDate(from)}${alerts.length ? " · à regarder" : ""}`, text, alerts, actions };
}
