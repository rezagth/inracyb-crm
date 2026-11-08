/**
 * Logique fiscale pure du suivi micro-entreprise (aucun accès base de données : testable seule).
 * Les seuils (plafond de CA, franchise de TVA) viennent des Paramètres et sont à vérifier chaque
 * année sur urssaf.fr et impots.gouv.fr : ce fichier ne contient AUCUN montant réglementaire.
 */
import { addDays, daysBetween } from "./format";

export const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export type UrssafPeriodicity = "mensuelle" | "trimestrielle";
export type UrssafPeriod = { label: string; from: string; to: string; deadline: string };

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

/**
 * Prochaine déclaration de chiffre d'affaires à l'URSSAF et période qu'elle couvre.
 * - Mensuelle : le mois précédent, à déclarer avant la fin du mois en cours.
 * - Trimestrielle : échéances fin janvier, avril, juillet et octobre ; chacune couvre le trimestre
 *   qui vient de se terminer (fin janvier : T4 de l'année précédente, fin avril : T1, etc.).
 */
export function urssafPeriod(todayIso: string, periodicity: string): UrssafPeriod {
  const [y, m] = todayIso.split("-").map(Number);
  if (periodicity === "trimestrielle") {
    const dueMonths = [1, 4, 7, 10];
    const next = dueMonths.find((dm) => dm >= m);
    const dm = next ?? 1;
    const dy = next ? y : y + 1;
    const quarter = dm === 1 ? 4 : (dm - 1) / 3; // 1 → T4, 4 → T1, 7 → T2, 10 → T3
    const py = dm === 1 ? dy - 1 : dy;
    const lastMonth = quarter * 3;
    return { label: `T${quarter} ${py}`, from: `${py}-${pad(lastMonth - 2)}-01`, to: lastDay(py, lastMonth), deadline: lastDay(dy, dm) };
  }
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return { label: `${MONTHS_FR[pm - 1]} ${py}`, from: `${py}-${pad(pm)}-01`, to: lastDay(py, pm), deadline: lastDay(y, m) };
}

export type FiscalReminder = { title: string; dueDate: string; priority: "haute" | "moyenne" };

export type FiscalInput = {
  today: string;
  periodicity: string;
  /** Encaissements de l'année en cours, hors taxes, en centimes. */
  cashYearCents: number;
  ceilingCents: number;
  tvaThresholdCents: number;
  tvaFranchise: boolean;
  /** Nombre de jours avant l'échéance URSSAF à partir duquel la tâche est créée. */
  leadDays?: number;
};

/** Plus haut palier atteint (80, 90 ou 100 %), ou 0. */
export function thresholdLevel(valueCents: number, limitCents: number): 0 | 80 | 90 | 100 {
  if (!limitCents || limitCents <= 0) return 0;
  const pct = (valueCents / limitCents) * 100;
  return pct >= 100 ? 100 : pct >= 90 ? 90 : pct >= 80 ? 80 : 0;
}

const fr = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Tâches de rappel à créer aujourd'hui. Les titres sont stables : l'appelant s'en sert pour ne créer
 * chaque rappel qu'une seule fois (une tâche terminée n'est donc jamais recréée).
 */
export function fiscalReminders(input: FiscalInput): FiscalReminder[] {
  const out: FiscalReminder[] = [];
  const year = input.today.slice(0, 4);
  const lead = input.leadDays ?? 10;

  const p = urssafPeriod(input.today, input.periodicity);
  if (daysBetween(input.today, p.deadline) <= lead) {
    const target = addDays(p.deadline, -5);
    out.push({
      title: `Déclarer le chiffre d'affaires à l'URSSAF : ${p.label} (avant le ${fr(p.deadline)})`,
      dueDate: target < input.today ? input.today : target,
      priority: "haute",
    });
  }

  const ca = thresholdLevel(input.cashYearCents, input.ceilingCents);
  if (ca) {
    out.push({
      title: ca === 100
        ? `Plafond de chiffre d'affaires dépassé en ${year} : fais le point avec un expert-comptable`
        : `Plafond de chiffre d'affaires : ${ca} % atteint en ${year}, fais le point avec un expert-comptable`,
      dueDate: input.today,
      priority: "haute",
    });
  }

  if (input.tvaFranchise) {
    const tva = thresholdLevel(input.cashYearCents, input.tvaThresholdCents);
    if (tva) {
      out.push({
        title: tva === 100
          ? `Seuil de franchise de TVA dépassé en ${year} : vérifie la date de passage à la TVA`
          : `Seuil de franchise de TVA : ${tva} % atteint en ${year}, prépare le passage à la TVA`,
        dueDate: input.today,
        priority: "haute",
      });
    }
  }
  return out;
}
