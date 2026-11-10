import "server-only";
import { db, schema } from "@/db";
import {
  ANNUAIRE_ENDPOINT, PLACES_ENDPOINT, PLACES_FIELDS, buildAnnuaireParams, buildPlacesBody, explainAnnuaireError,
  matchByName, normalizeCompany, normalizeSearch, pickPlace, type Candidate, type SearchInput, type SearchPage,
} from "@/lib/prospect-search";

export type Found = Candidate & { inCrm: boolean };
export type FoundPage = Omit<SearchPage, "items"> & { items: Found[] };
type Res<T> = ({ ok: true } & T) | { ok: false; error: string };

export const placesReady = () => !!(process.env.GOOGLE_PLACES_API_KEY || "").trim();

async function annuaireGet(params: URLSearchParams): Promise<Res<{ json: unknown }>> {
  try {
    const res = await fetch(`${ANNUAIRE_ENDPOINT}?${params}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: explainAnnuaireError(res.status, json) };
    return { ok: true, json };
  } catch {
    return { ok: false, error: "L'Annuaire des Entreprises ne répond pas (réseau ou délai dépassé). Réessaie dans un instant." };
  }
}

/** Entreprises déjà dans le CRM : par SIREN, ou par nom identique pour celles saisies à la main sans SIREN. */
async function existing() {
  const rows = await db.select({ name: schema.companies.name, siren: schema.companies.siren }).from(schema.companies);
  return { sirens: new Set(rows.map((r) => r.siren).filter(Boolean)), names: new Set(rows.map((r) => r.name.trim().toLowerCase())) };
}

export async function searchAnnuaire(input: SearchInput): Promise<Res<{ page: FoundPage }>> {
  const r = await annuaireGet(buildAnnuaireParams(input));
  if (!r.ok) return r;
  const page = normalizeSearch(r.json, input.departement);
  const ex = await existing();
  return { ok: true, page: { ...page, items: page.items.map((c) => ({ ...c, inCrm: ex.sirens.has(c.siren) || ex.names.has(c.name.trim().toLowerCase()) })) } };
}

/** Relit une entreprise par SIREN auprès de l'Annuaire : les données importées ne viennent jamais du navigateur. */
export async function fetchBySiren(siren: string): Promise<Res<{ company: Candidate | null }>> {
  if (!/^\d{9}$/.test(siren)) return { ok: true, company: null };
  const r = await annuaireGet(new URLSearchParams({ q: siren, per_page: "1" }));
  if (!r.ok) return r;
  const first = (r.json as { results?: unknown[] } | null)?.results?.[0];
  const company = normalizeCompany(first);
  return { ok: true, company: company && company.siren === siren ? company : null };
}

/** Retrouve une entreprise saisie sans SIREN par son nom (correspondance stricte : nom identique + lieu). */
export async function fetchByName(name: string, postalCode: string, city: string): Promise<Res<{ company: Candidate | null }>> {
  const r = await annuaireGet(new URLSearchParams({ q: name, per_page: "10", etat_administratif: "A" }));
  if (!r.ok) return r;
  return { ok: true, company: matchByName(normalizeSearch(r.json).items, name, postalCode, city) };
}

export async function findPlace(name: string, city: string, postalCode: string): Promise<Res<{ phone: string; website: string } | { phone: ""; website: "" }>> {
  const key = (process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!key) return { ok: false, error: "Google Places n'est pas configuré : ajoute GOOGLE_PLACES_API_KEY dans .env (et dans Vercel)." };
  try {
    const res = await fetch(PLACES_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key, "x-goog-fieldmask": PLACES_FIELDS },
      body: JSON.stringify(buildPlacesBody(name, city)),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.status === 403 || res.status === 401) return { ok: false, error: "Google refuse la clé : vérifie GOOGLE_PLACES_API_KEY et que « Places API (New) » est activée avec la facturation." };
    if (res.status === 429) return { ok: false, error: "Quota Google Places atteint : réessaie plus tard." };
    if (!res.ok) return { ok: false, error: `Google Places a répondu ${res.status}.` };
    const hit = pickPlace(json, postalCode, city);
    return hit ? { ok: true, ...hit } : { ok: true, phone: "", website: "" };
  } catch {
    return { ok: false, error: "Google Places ne répond pas. Réessaie dans un instant." };
  }
}
