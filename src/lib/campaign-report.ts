/**
 * Bilan des campagnes par service et par segment : règles pures (sans base), donc testables.
 * L'unité est l'entreprise contactée, suivie de son premier mail jusqu'au devis accepté.
 * Aucune conclusion n'est tirée d'un échantillon trop petit.
 */
import { addDaysIso, SERVICE_KEYS, SERVICE_LABEL, type ServiceKey } from "./campaign";
import { SEGMENT_LABEL, isSegment } from "./diagnostic-mails";

/** Une entreprise dans une campagne, avec ce qui lui est arrivé depuis. */
export type ProspectRecord = {
  service: ServiceKey;
  /** segment de la campagne (diagnostic) ou du secteur de l'entreprise (audit) ; "autres" hors segments */
  segment: string;
  /** date du premier mail reçu (AAAA-MM-JJ), null si rien n'est encore parti */
  firstSend: string | null;
  mails: number;
  /** au moins un mail confirmé délivré par Brevo ; null si Brevo ne transmet pas cet événement */
  delivered: boolean | null;
  bounced: boolean;
  complained: boolean;
  optedOut: boolean;
  replied: boolean;
  /** dates des rendez-vous de l'entreprise */
  meetings: string[];
  /** dates des devis acceptés de l'entreprise */
  signed: string[];
};

/**
 * Une entreprise peut figurer dans plusieurs campagnes d'un même service (arrêtée dans l'une, reprise dans une autre) :
 * le bilan la compte une seule fois par service. Mails, premier envoi et accusés sont déjà ceux du service entier ;
 * une réponse, un rebond, une plainte ou une désinscription dans l'une des campagnes vaut pour l'entreprise.
 * Le segment retenu est celui de la première inscription (ordre reçu).
 */
export function onePerCompany(records: (ProspectRecord & { companyId: string })[]): ProspectRecord[] {
  const out = new Map<string, ProspectRecord>();
  for (const { companyId, ...r } of records) {
    const key = companyId + "|" + r.service;
    const m = out.get(key);
    if (!m) {
      out.set(key, { ...r, meetings: [...r.meetings], signed: [...r.signed] });
      continue;
    }
    m.firstSend = [m.firstSend, r.firstSend].filter((d): d is string => !!d).sort()[0] ?? null;
    m.mails = Math.max(m.mails, r.mails);
    m.delivered = m.delivered === null || r.delivered === null ? (m.delivered ?? r.delivered) : m.delivered || r.delivered;
    m.bounced ||= r.bounced;
    m.complained ||= r.complained;
    m.optedOut ||= r.optedOut;
    m.replied ||= r.replied;
    m.meetings = [...new Set([...m.meetings, ...r.meetings])];
    m.signed = [...new Set([...m.signed, ...r.signed])];
  }
  return [...out.values()];
}

export const HORIZONS = [14, 30] as const;
export type Horizon = (typeof HORIZONS)[number] | null;

/** En dessous, on affiche les chiffres mais on ne compare pas et on ne conclut pas. */
export const MIN_SAMPLE = 30;

export type ReportRow = { service: ServiceKey; segment: string; label: string; contacted: number; mails: number; delivered: number | null; bounced: number; complained: number; optedOut: number; replied: number; meetings: number; signed: number };

export const segmentLabel = (s: string): string => (isSegment(s) ? SEGMENT_LABEL[s] : "Autres secteurs");

/**
 * Tableau par service et segment. Avec un horizon (14 ou 30 jours), seules comptent les entreprises dont le premier
 * mail date d'au moins ce nombre de jours, et seuls les rendez-vous et devis survenus dans ce délai : les cohortes
 * sont alors comparables entre elles. Réponses, rebonds, plaintes et désinscriptions sont pris dans leur état du jour.
 */
export function buildReport(records: ProspectRecord[], today: string, horizon: Horizon): ReportRow[] {
  const rows = new Map<string, ReportRow>();
  for (const r of records) {
    if (!r.firstSend) continue;
    if (horizon !== null && addDaysIso(r.firstSend, horizon) > today) continue;
    const until = horizon === null ? "9999-12-31" : addDaysIso(r.firstSend, horizon);
    const within = (d: string) => d >= r.firstSend! && d <= until;
    const key = r.service + "|" + r.segment;
    const row = rows.get(key) ?? { service: r.service, segment: r.segment, label: `${SERVICE_LABEL[r.service]} · ${segmentLabel(r.segment)}`, contacted: 0, mails: 0, delivered: r.delivered === null ? null : 0, bounced: 0, complained: 0, optedOut: 0, replied: 0, meetings: 0, signed: 0 };
    row.contacted++;
    row.mails += r.mails;
    if (r.delivered === null) row.delivered = null;
    else if (row.delivered !== null && r.delivered) row.delivered++;
    if (r.bounced) row.bounced++;
    if (r.complained) row.complained++;
    if (r.optedOut) row.optedOut++;
    if (r.replied) row.replied++;
    if (r.meetings.some(within)) row.meetings++;
    if (r.signed.some(within)) row.signed++;
    rows.set(key, row);
  }
  const order = (r: ReportRow) => SERVICE_KEYS.indexOf(r.service) + "|" + (r.segment === "autres" ? "z" : r.segment);
  return [...rows.values()].sort((a, b) => (order(a) < order(b) ? -1 : 1));
}

/** Taux en pourcentage à une décimale, « — » sans dénominateur. */
export function rate(k: number | null, n: number): string {
  if (k === null || n <= 0) return "—";
  return (Math.round((k / n) * 1000) / 10).toLocaleString("fr-FR") + " %";
}

/** Intervalle de confiance à 95 % d'une proportion (méthode de Wilson, fiable sur les petits effectifs). */
export function wilson(k: number, n: number): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 1 };
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { low: Math.max(0, c - h), high: Math.min(1, c + h) };
}

export type Verdict = { conclusive: boolean; text: string };

/**
 * Compare un taux entre deux lignes. Échantillon trop petit : pas de conclusion. Sinon, l'écart n'est retenu que si
 * les intervalles de confiance ne se recouvrent pas.
 */
export function compareRates(what: string, a: { label: string; k: number; n: number }, b: { label: string; k: number; n: number }): Verdict {
  const small = [a, b].filter((x) => x.n < MIN_SAMPLE);
  if (small.length) return { conclusive: false, text: `${what} : échantillon trop petit pour conclure (${small.map((x) => `${x.label} : ${x.n} entreprise(s)`).join(" ; ")}, minimum ${MIN_SAMPLE} par ligne).` };
  const ia = wilson(a.k, a.n), ib = wilson(b.k, b.n);
  const figures = `${a.label} ${rate(a.k, a.n)} (${a.k}/${a.n}), ${b.label} ${rate(b.k, b.n)} (${b.k}/${b.n})`;
  if (ia.low > ib.high) return { conclusive: true, text: `${what} : ${a.label} fait nettement mieux. ${figures}.` };
  if (ib.low > ia.high) return { conclusive: true, text: `${what} : ${b.label} fait nettement mieux. ${figures}.` };
  return { conclusive: false, text: `${what} : écart non concluant, il peut venir du hasard. ${figures}.` };
}

/** Comparaisons utiles : segments du diagnostic entre eux, puis diagnostic contre audit, sur les réponses et les rendez-vous. */
export function verdicts(rows: ReportRow[]): Verdict[] {
  const out: Verdict[] = [];
  const pair = (a: ReportRow | undefined, b: ReportRow | undefined, la: string, lb: string) => {
    if (!a || !b) return;
    out.push(compareRates("Taux de réponse", { label: la, k: a.replied, n: a.contacted }, { label: lb, k: b.replied, n: b.contacted }));
    out.push(compareRates("Taux de rendez-vous", { label: la, k: a.meetings, n: a.contacted }, { label: lb, k: b.meetings, n: b.contacted }));
  };
  const diag = rows.filter((r) => r.service === "diagnostic");
  pair(diag.find((r) => r.segment === "editeurs"), diag.find((r) => r.segment === "cabinets"), SEGMENT_LABEL.editeurs, SEGMENT_LABEL.cabinets);
  const total = (service: ServiceKey): ReportRow | undefined => {
    const rs = rows.filter((r) => r.service === service);
    if (!rs.length) return undefined;
    return rs.reduce((a, r) => ({ ...a, contacted: a.contacted + r.contacted, replied: a.replied + r.replied, meetings: a.meetings + r.meetings }), { ...rs[0], contacted: 0, replied: 0, meetings: 0 });
  };
  pair(total("diagnostic"), total("audit"), "Diagnostic", "Audit");
  return out;
}
