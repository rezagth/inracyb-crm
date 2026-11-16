/**
 * Rapport de diagnostic d'une page, autonome (HTML imprimable : « Imprimer > Enregistrer en PDF »).
 * Règle pure : tout texte venu de l'extérieur est échappé. Aucun score, seulement ce qui a été mesuré.
 */
import { fd } from "./format";
import { mailable, STATUS_LABEL, type Check } from "./diagnostic";

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export type ReportInput = { company: string; mailDomain: string; webHost: string; checkedOn: string; rulesVersion: string; checks: Check[]; author: string; authorCompany: string; authorContact: string };

export function renderReport(r: ReportInput): string {
  const certain = r.checks.filter(mailable);
  const others = r.checks.filter((c) => !mailable(c));
  const scope = [r.mailDomain && `messagerie : ${r.mailDomain}`, r.webHost && `site : ${r.webHost}`].filter(Boolean).join(" · ");
  const finding = (c: Check, i: number) => `<section class="f"><h3>${i + 1}. ${esc(c.label)}</h3><p>${esc(c.wording)}</p><p class="p">Mesure : ${esc(c.proof)}</p></section>`;
  const row = (c: Check) => `<tr><td>${esc(c.label)}</td><td class="s">${esc(STATUS_LABEL[c.status] ?? c.status)}</td><td>${esc(c.wording)}</td></tr>`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Diagnostic — ${esc(r.company)}</title>
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{font:12.5px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#16181d;max-width:780px;margin:24px auto;padding:0 16px}
h1{font-size:20px;margin:0 0 2px}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #d5d8de;padding-bottom:3px}h3{font-size:12.5px;margin:0 0 2px}
.m{color:#555b66;margin:0 0 4px}.f{margin:0 0 9px;break-inside:avoid}.f p{margin:0}.p{color:#555b66;font-size:11.5px;overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;font-size:11.5px}td{border-top:1px solid #e3e5ea;padding:4px 6px 4px 0;vertical-align:top;overflow-wrap:anywhere}td.s{white-space:nowrap;color:#555b66}
.n{color:#555b66;font-size:11px;margin-top:14px}
@media print{body{margin:0;max-width:none;padding:0}}
</style></head><body>
<h1>Diagnostic de sécurité visible de l'extérieur</h1>
<p class="m">${esc(r.company)} · ${esc(scope)}</p>
<p class="m">Mesures du ${esc(fd(r.checkedOn))} · ${esc(r.author)}${r.authorCompany ? `, ${esc(r.authorCompany)}` : ""}${r.authorContact ? ` · ${esc(r.authorContact)}` : ""}</p>
<h2>Constats mesurés (${certain.length})</h2>
${certain.length ? certain.map(finding).join("\n") : "<p>Aucun écart certain n'a été mesuré sur les points vérifiés.</p>"}
<h2>Autres points vérifiés</h2>
<table><tbody>
${others.map(row).join("\n")}
</tbody></table>
<p class="n">Méthode : uniquement des informations publiques, lues sans intrusion (enregistrements DNS interrogés auprès de deux résolveurs indépendants, certificat présenté par le site, en-têtes de la page d'accueil, fichier security.txt). Aucun test d'intrusion, aucun balayage de ports, aucune tentative de connexion. Ces mesures décrivent l'état observé à la date indiquée et peuvent avoir changé depuis. Elles ne constituent ni un audit ni une évaluation globale de votre sécurité : « non détecté » ne signifie pas « absent ». Règles de mesure : version ${esc(r.rulesVersion)}.</p>
</body></html>`;
}
