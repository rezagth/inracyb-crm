import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "icrm_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 10; // 10 h

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET manquant ou trop court : lancez `npm run setup`.");
  return new TextEncoder().encode(s);
}

export async function signSession(payload: { sub: string; sv: number }): Promise<string> {
  return new SignJWT({ sv: payload.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setIssuer("infracyb-crm")
    .sign(secret());
}

export async function verifySession(token: string): Promise<{ sub: string; sv: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "infracyb-crm", algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.sv !== "number") return null;
    return { sub: payload.sub, sv: payload.sv };
  } catch {
    return null;
  }
}
