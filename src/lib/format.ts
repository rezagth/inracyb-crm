/** Formats français : 1 234,56 €, 24 %, 06/11/2026. */

const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const eur0Fmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function eur(cents: number, opts?: { round?: boolean }): string {
  return (opts?.round ? eur0Fmt : eurFmt).format((cents || 0) / 100);
}

export function pct(value: number, digits = 1): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value) + " %";
}

export function num(value: number, digits = 2): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value);
}

/** AAAA-MM-JJ → JJ/MM/AAAA */
export function fd(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export function fdt(date?: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(date);
}

/** Date du jour à Paris, au format AAAA-MM-JJ. */
export function today(): string {
  const parts = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts; // fr-CA => AAAA-MM-JJ
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86_400_000);
}

/** « 1 234,56 » ou « 1234.56 » → centimes. */
export function parseEuroToCents(input: string | number | null | undefined): number {
  if (typeof input === "number") return Math.round(input * 100);
  const s = String(input ?? "").replace(/[\s  €]/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

export function initials(name: string): string {
  const w = name.replace(/^Dr\.?\s+/i, "").trim().split(/\s+/);
  return ((w[0]?.[0] ?? "?") + (w[1]?.[0] ?? "")).toUpperCase();
}
