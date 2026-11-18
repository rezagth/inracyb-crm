import "server-only";
import type { Inbound } from "@/lib/replies";

/**
 * Lecture des réponses dans Gmail, en lecture seule (portée https://www.googleapis.com/auth/gmail.readonly).
 * Variables : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN (voir DEPLOIEMENT.md). Aucun secret n'est jamais journalisé.
 */
export type GmailConfig = { clientId: string; clientSecret: string; refreshToken: string };
export function gmailConfig(): GmailConfig | null {
  const clientId = (process.env.GMAIL_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GMAIL_CLIENT_SECRET || "").trim();
  const refreshToken = (process.env.GMAIL_REFRESH_TOKEN || "").trim();
  return clientId && clientSecret && refreshToken ? { clientId, clientSecret, refreshToken } : null;
}

type Fetch = typeof fetch;
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function accessToken(cfg: GmailConfig, f: Fetch): Promise<string> {
  const res = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error === "invalid_grant" ? "Gmail refuse le jeton : l'autorisation a expiré ou été retirée, recommence l'autorisation (DEPLOIEMENT.md)." : `Gmail : jeton refusé (${res.status}).`);
  return j.access_token;
}

/** Messages reçus dans la boîte de réception ces N derniers jours, hors ceux que l'utilisateur a envoyés. Au plus `max`. */
export async function listRecentInbound(opts: { days?: number; max?: number; fetchFn?: Fetch; cfg?: GmailConfig } = {}): Promise<Inbound[]> {
  const cfg = opts.cfg ?? gmailConfig();
  if (!cfg) throw new Error("Gmail n'est pas configuré.");
  const f = opts.fetchFn ?? fetch;
  const token = await accessToken(cfg, f);
  const headers = { authorization: `Bearer ${token}` };
  const q = `in:inbox newer_than:${Math.max(1, Math.min(opts.days ?? 3, 14))}d -from:me`;
  const list = await f(`${API}/messages?${new URLSearchParams({ q, maxResults: String(Math.min(opts.max ?? 100, 200)) })}`, { headers, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!list.ok) throw new Error(`Gmail : liste des messages refusée (${list.status}).`);
  const ids = ((await list.json().catch(() => ({}))) as { messages?: { id: string }[] }).messages?.map((m) => m.id) ?? [];
  const out: Inbound[] = [];
  // Petits lots : on reste poli avec l'API et on tient dans le budget d'une fonction.
  for (let i = 0; i < ids.length; i += 10) {
    const batch = await Promise.all(
      ids.slice(i, i + 10).map(async (id) => {
        const params = new URLSearchParams({ format: "metadata" });
        for (const h of ["From", "Subject", "Auto-Submitted", "Precedence"]) params.append("metadataHeaders", h);
        const r = await f(`${API}/messages/${encodeURIComponent(id)}?${params}`, { headers, signal: AbortSignal.timeout(10_000), cache: "no-store" }).catch(() => null);
        if (!r?.ok) return null;
        const j = (await r.json().catch(() => null)) as { id?: string; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } } | null;
        if (!j?.id) return null;
        const h = (n: string) => j.payload?.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
        return { id: j.id, from: h("From"), subject: h("Subject"), snippet: String(j.snippet ?? "").slice(0, 600), autoSubmitted: h("Auto-Submitted"), precedence: h("Precedence"), receivedAt: Number(j.internalDate) || undefined } satisfies Inbound;
      }),
    );
    for (const m of batch) if (m) out.push(m);
  }
  return out;
}
