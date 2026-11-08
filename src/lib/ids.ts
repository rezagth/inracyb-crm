import { randomBytes } from "node:crypto";

/** Identifiant opaque, non devinable (128 bits). */
export function createId(): string {
  return randomBytes(16).toString("base64url");
}
