import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Vercel Cron envoie « Authorization: Bearer <CRON_SECRET> ». Sans CRON_SECRET (16 caractères minimum), tout est refusé. */
export function cronAuthorized(authorization: string | null): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  const a = Buffer.from(secret);
  const b = Buffer.from((authorization || "").replace(/^Bearer\s+/i, ""));
  return secret.length >= 16 && a.length === b.length && timingSafeEqual(a, b);
}
