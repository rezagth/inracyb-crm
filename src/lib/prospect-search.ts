/**
 * Recherche automatique de prospects : sources ouvertes uniquement.
 *  - Annuaire des Entreprises (API officielle recherche-entreprises.api.gouv.fr, gratuite et sans clé) : nom, SIREN, adresse,
 *    activité (NAF), tranche d'effectif et dirigeants. Pas d'e-mail ni de téléphone dans cette base.
 *  - Google Places (facultatif, clé payante au-delà du quota gratuit) : téléphone et site web, à la demande, entreprise par entreprise.
 * Partie sans effet de bord : construction des requêtes et lecture des réponses (testable sans réseau).
 */
import type { SECTORS } from "./constants";

export type Sector = (typeof SECTORS)[number];
export type OfferKey = "audit" | "ciso" | "ia";

export const ANNUAIRE_ENDPOINT = "https://recherche-entreprises.api.gouv.fr/search";
export const PER_PAGE = 25;

/** Offre du moteur de scripts → identifiant d'offre stocké sur l'entreprise. */
export const OFFER_ID: Record<OfferKey, "Audit" | "CISOaaS" | "IA"> = { audit: "Audit", ciso: "CISOaaS", ia: "IA" };

/** Secteurs interrogeables : codes NAF (rév. 2) et mot-clé de nom éventuel. « Autres » n'a pas de code : il faut un mot-clé. */
export const SECTOR_SEARCH: Partial<Record<Sector, { naf: string[]; q?: string; hint: string }>> = {
  Juridique: { naf: ["69.10Z"], hint: "Avocats et cabinets juridiques" },
  Notariat: { naf: ["69.10Z"], q: "notaire", hint: "Études et offices notariaux" },
  "Expertise comptable": { naf: ["69.20Z"], hint: "Cabinets d'expertise comptable" },
  Immobilier: { naf: ["68.31Z", "68.32A"], hint: "Agences immobilières et syndics" },
  Santé: { naf: ["86.21Z", "86.22C", "86.23Z", "86.90B", "86.90E"], hint: "Médecins, dentistes, laboratoires, rééducation" },
};
export const SEARCHABLE_SECTORS = Object.keys(SECTOR_SEARCH) as Sector[];

/** Tranches d'effectif salarié (codes Insee). */
export const EFFECTIFS: { code: string; label: string }[] = [
  { code: "01", label: "1 à 2" },
  { code: "02", label: "3 à 5" },
  { code: "03", label: "6 à 9" },
  { code: "11", label: "10 à 19" },
  { code: "12", label: "20 à 49" },
  { code: "21", label: "50 à 99" },
];
const EFFECTIF_LABEL: Record<string, string> = {
  "00": "0 salarié", "01": "1 à 2", "02": "3 à 5", "03": "6 à 9", "11": "10 à 19", "12": "20 à 49", "21": "50 à 99", "22": "100 à 199",
  "31": "200 à 249", "32": "250 à 499", "41": "500 à 999", "42": "1 000 à 1 999", "51": "2 000 à 4 999", "52": "5 000 à 9 999", "53": "10 000 et plus",
};
export const EFFECTIF_CODES = EFFECTIFS.map((e) => e.code);
export const effectifLabel = (code: string | null | undefined) => (code && EFFECTIF_LABEL[code] ? EFFECTIF_LABEL[code] + " salariés" : "Non renseigné");

/** Tailles ciblées selon le service proposé (modifiables dans l'écran). */
export const OFFER_SIZES: Record<OfferKey, string[]> = {
  audit: ["02", "03", "11", "12"],
  ciso: ["03", "11", "12", "21"],
  ia: ["02", "03", "11", "12"],
};

export type SearchInput = { offer: OfferKey; sector: Sector; departement: string; effectifs: string[]; query: string; page: number };

/** Paramètres de l'API Annuaire. Le département filtre les établissements : le siège peut être ailleurs. */
export function buildAnnuaireParams(i: SearchInput): URLSearchParams {
  const cfg = SECTOR_SEARCH[i.sector];
  const p = new URLSearchParams();
  if (cfg) p.set("activite_principale", cfg.naf.join(","));
  const q = [cfg?.q, i.query.trim()].filter(Boolean).join(" ").trim();
  if (q) p.set("q", q);
  if (i.effectifs.length) p.set("tranche_effectif_salarie", i.effectifs.join(","));
  if (i.departement) p.set("departement", i.departement);
  p.set("etat_administratif", "A");
  p.set("per_page", String(PER_PAGE));
  p.set("page", String(Math.max(1, i.page)));
  return p;
}

export type Candidate = {
  siren: string;
  name: string;
  sector: Sector;
  naf: string;
  address: string;
  postalCode: string;
  city: string;
  effectif: string;
  director: { firstName: string; lastName: string; role: string } | null;
  /** L'entreprise s'est opposée à la réutilisation commerciale de ses données : jamais importée ni démarchée. */
  blocked: boolean;
};
export type SearchPage = { total: number; totalPages: number; page: number; items: Candidate[] };

const KEEP_UPPER = new Set(["SAS", "SASU", "SARL", "EURL", "SELARL", "SELAS", "SELURL", "SCP", "SCM", "SCI", "SA", "SNC", "GIE", "AARPI", "CPAM", "RCS", "ERP", "IT"]);
/** « CABINET DUPONT-MARTIN SARL » → « Cabinet Dupont-Martin SARL ». */
export function titleCase(s: string, keepAcronyms = false): string {
  const t = s.trim();
  if (!t || t !== t.toUpperCase()) return t; // déjà en casse mixte : on ne touche à rien
  return t
    .toLowerCase()
    .split(/(\s+)/)
    .map((w) => (keepAcronyms && KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w.replace(/(^|[-'’])([a-zà-ÿ])/g, (_m, a: string, b: string) => a + b.toUpperCase())))
    .join("");
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export function sectorFromNaf(naf: string, name = ""): Sector {
  if (naf === "69.10Z") return /notair|notaire/i.test(name) ? "Notariat" : "Juridique";
  if (naf === "69.20Z") return "Expertise comptable";
  if (naf.startsWith("68.3")) return "Immobilier";
  if (naf.startsWith("86.")) return "Santé";
  return "Autres";
}

/** Premier dirigeant personne physique (les personnes morales, commissaires aux comptes, etc. sont ignorés). */
export function pickDirector(dirigeants: unknown): Candidate["director"] {
  if (!Array.isArray(dirigeants)) return null;
  for (const d of dirigeants) {
    const r = rec(d);
    if (str(r.type_dirigeant) !== "personne physique") continue;
    const lastName = titleCase(str(r.nom));
    const firstName = titleCase(str(r.prenoms).split(",")[0].split(/\s+/)[0] ?? "");
    if (!lastName && !firstName) continue;
    return { firstName: firstName || lastName, lastName: firstName ? lastName : "", role: str(r.qualite) };
  }
  return null;
}

/** Transforme une entreprise de l'API en prospect. Retourne null si les champs vitaux manquent. */
export function normalizeCompany(raw: unknown, wantDept = ""): Candidate | null {
  const r = rec(raw);
  const siren = str(r.siren);
  if (!/^\d{9}$/.test(siren)) return null;
  const siege = rec(r.siege);
  const local = wantDept && Array.isArray(r.matching_etablissements) ? rec(r.matching_etablissements[0]) : {};
  const site = Object.keys(local).length ? local : siege;
  const naf = str(r.activite_principale) || str(siege.activite_principale);
  const name = titleCase(str(r.nom_complet) || str(r.nom_raison_sociale), true);
  if (!name) return null;
  const city = titleCase(str(site.libelle_commune) || str(siege.libelle_commune));
  // Adresse de facturation du CRM : « n°, rue, code postal », la ville est saisie à part.
  let address = titleCase(str(site.adresse) || str(siege.adresse), true);
  if (city && address.toLowerCase().endsWith(" " + city.toLowerCase())) address = address.slice(0, address.length - city.length - 1).trim();
  return {
    siren,
    name,
    sector: sectorFromNaf(naf, name),
    naf,
    address,
    postalCode: str(site.code_postal) || str(siege.code_postal),
    city,
    effectif: effectifLabel(str(r.tranche_effectif_salarie) || str(siege.tranche_effectif_salarie)),
    director: pickDirector(r.dirigeants),
    blocked: r.opposition_diffusion_commerciale === true,
  };
}

export function normalizeSearch(json: unknown, wantDept = ""): SearchPage {
  const r = rec(json);
  const results = Array.isArray(r.results) ? r.results : [];
  return {
    total: Number(r.total_results) || 0,
    totalPages: Math.min(Number(r.total_pages) || 0, 400),
    page: Number(r.page) || 1,
    items: results.map((x) => normalizeCompany(x, wantDept)).filter((x): x is Candidate => !!x),
  };
}

/** Message lisible pour une erreur de l'API Annuaire. */
export function explainAnnuaireError(status: number, body: unknown): string {
  const msg = str(rec(body).message) || str(rec(body).error);
  if (status === 429) return "L'Annuaire des Entreprises limite le débit : attends quelques secondes et réessaie.";
  if (status === 400 || status === 422) return `Recherche refusée par l'Annuaire des Entreprises${msg ? " : " + msg : ""}. Vérifie le département et les mots-clés.`;
  if (status >= 500) return "L'Annuaire des Entreprises est indisponible pour le moment : réessaie dans quelques minutes.";
  return `Réponse inattendue de l'Annuaire des Entreprises (${status}).`;
}

/* ---------- Google Places (facultatif) ---------- */
export const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
export const PLACES_FIELDS = "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri";

export function buildPlacesBody(name: string, city: string) {
  return { textQuery: `${name} ${city}`.trim(), languageCode: "fr", regionCode: "FR", maxResultCount: 3 };
}

/** Garde-fou : on n'accepte un résultat que si son adresse contient le code postal (ou, à défaut de code postal, la ville) du prospect. */
export function pickPlace(json: unknown, postalCode: string, city = ""): { phone: string; website: string } | null {
  const places = rec(json).places;
  const cpOk = /^\d{5}$/.test(postalCode);
  if (!Array.isArray(places) || (!cpOk && !city.trim())) return null;
  for (const p of places) {
    const r = rec(p);
    const addr = str(r.formattedAddress).toLowerCase();
    if (!(cpOk ? addr.includes(postalCode) : addr.includes(city.trim().toLowerCase()))) continue;
    const phone = str(r.nationalPhoneNumber);
    const website = str(r.websiteUri);
    if (phone || website) return { phone, website };
  }
  return null;
}
