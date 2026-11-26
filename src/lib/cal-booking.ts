/**
 * Réservations Cal.com reçues par webhook (phase U). Règles pures, testées : signature, lecture de la réservation,
 * heure de Paris, domaine de l'entreprise. Documentation vérifiée le 26/11/2026 (cal.com/help/webhooks) :
 * en-tête « X-Cal-Signature-256 » = HMAC-SHA256 hexadécimal du corps brut, avec le secret du webhook ;
 * corps { triggerEvent, createdAt, payload: { uid, startTime, endTime, title, eventTitle, attendees[], responses{}, location, metadata } }.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const CAL_TRIGGERS = ["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"] as const;
export type CalTrigger = (typeof CAL_TRIGGERS)[number];
/** Repère écrit dans la note du rendez-vous : retrouve la réservation (report, annulation) et évite les doublons. */
export const CAL_MARK = "Réservation Cal";
/** Motif d'arrêt des relances quand le prospect réserve lui-même. */
export const BOOKED_REASON = "A pris rendez-vous";

/** Identifiants des questions à créer dans Cal.com (champ « Identifier » de chaque question). */
export const CAL_QUESTIONS = { company: "entreprise", site: "site", topic: "sujet" } as const;

export function verifyCalSignature(secret: string, rawBody: string, header: string | null): boolean {
  if (secret.length < 16 || !header || !/^[0-9a-f]{64}$/i.test(header)) return false;
  const good = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"));
  const given = Buffer.from(header.toLowerCase());
  return good.length === given.length && timingSafeEqual(good, given);
}

const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Réponse à une question Cal : chaîne, ou objet { value } (selon le type de question). */
function answer(responses: unknown, key: string): string {
  if (!responses || typeof responses !== "object") return "";
  const r = (responses as Record<string, unknown>)[key];
  if (typeof r === "string") return str(r);
  if (r && typeof r === "object" && "value" in r) {
    const v = (r as { value: unknown }).value;
    if (typeof v === "string") return str(v);
    if (Array.isArray(v)) return str(v.filter((x) => typeof x === "string").join(", "));
    if (v && typeof v === "object" && "value" in v) return str((v as { value: unknown }).value);
  }
  return "";
}

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;
const FREE_MAIL = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|orange|wanadoo|free|laposte|sfr|neuf|bbox|gmx|proton|protonmail|aol)\.[a-z.]+$/i;

/** Domaine de l'entreprise : le site déclaré d'abord, sinon celui de l'adresse si ce n'est pas une messagerie grand public. */
export function bookingDomain(email: string, site: string): string {
  const fromSite = site.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0];
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(fromSite)) return fromSite;
  const d = email.split("@")[1]?.toLowerCase() ?? "";
  return d && !FREE_MAIL.test(d) && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : "";
}

/** Instant ISO → jour et heure à Paris (« AAAA-MM-JJ », « HH:MM »). */
export function parisSlot(iso: string): { date: string; time: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export type CalBooking = {
  trigger: CalTrigger;
  uid: string;
  /** réservation remplacée (report) */
  previousUid: string;
  date: string;
  start: string;
  end: string;
  name: string;
  email: string;
  /** téléphone saisi (question « Numéro de téléphone » de Cal, facultative) ; "" sinon */
  phone: string;
  company: string;
  domain: string;
  topic: string;
  notes: string;
  eventTitle: string;
  /** lien de visio ou lieu */
  location: string;
};

/** Lit et valide une réservation ; null si le corps n'est pas une réservation exploitable. */
export function parseCalBooking(body: unknown): CalBooking | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { triggerEvent?: unknown; payload?: Record<string, unknown> };
  const trigger = CAL_TRIGGERS.find((t) => t === b.triggerEvent);
  const p = b.payload;
  if (!trigger || !p) return null;
  const uid = str(p.uid, 100);
  const attendee = Array.isArray(p.attendees) ? (p.attendees[0] as Record<string, unknown> | undefined) : undefined;
  const email = (str(attendee?.email, 200) || answer(p.responses, "email")).toLowerCase();
  const start = parisSlot(str(p.startTime, 40));
  const end = parisSlot(str(p.endTime, 40));
  if (!uid || !EMAIL_RE.test(email) || !start || !end) return null;
  const meta = (p.metadata ?? {}) as Record<string, unknown>;
  const video = str(meta.videoCallUrl, 300) || str((p.videoCallData as Record<string, unknown> | undefined)?.url, 300);
  const location = /^https:\/\//i.test(video) ? video : str(p.location, 300);
  const site = answer(p.responses, CAL_QUESTIONS.site);
  return {
    trigger,
    uid,
    previousUid: str(p.rescheduleUid, 100) || str(p.fromReschedule, 100) || str(p.rescheduledFromUid, 100),
    date: start.date,
    start: start.time,
    end: end.date === start.date ? end.time : "23:59",
    name: str(attendee?.name, 120) || answer(p.responses, "name"),
    email,
    phone: cleanPhone(answer(p.responses, "attendeePhoneNumber") || str(attendee?.phoneNumber, 40)),
    company: answer(p.responses, CAL_QUESTIONS.company).slice(0, 120),
    domain: bookingDomain(email, site),
    topic: answer(p.responses, CAL_QUESTIONS.topic).slice(0, 120),
    notes: (answer(p.responses, "notes") || str(p.additionalNotes, 1000)).slice(0, 1000),
    eventTitle: str(p.eventTitle, 120) || str(p.type, 120) || "Rendez-vous",
    location,
  };
}

/** Téléphone utilisable (9 à 15 chiffres, « + » initial admis), sinon "". */
export function cleanPhone(raw: string): string {
  const v = raw.replace(/[^\d+ .()-]/g, "").trim().slice(0, 30);
  const digits = v.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15 ? v : "";
}

/** Prénom et nom à partir du nom saisi dans Cal. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}
