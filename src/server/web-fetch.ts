import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Adresses non publiques : jamais interrogées (protection contre les requêtes vers le réseau interne). */
export function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateIp(mapped[1]);
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (isIP(v) === 6) return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff");
  return true;
}

async function assertPublic(hostname: string) {
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("adresse non publique");
    return;
  }
  const addrs = await lookup(hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("adresse non publique");
}

const UA = "Mozilla/5.0 (compatible; InfraCybCRM/1.0; +https://infracyb.fr)";
const MAX_BYTES = 600_000;

/** Télécharge une page HTML publique : http(s) seulement, ports 80/443, redirections revérifiées, taille et durée bornées. */
export async function fetchHtml(startUrl: string, deadline: number): Promise<{ html: string; url: string } | null> {
  let url = startUrl;
  for (let hop = 0; hop < 4; hop++) {
    const left = deadline - Date.now();
    if (left < 800) return null;
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol) || (u.port && u.port !== "80" && u.port !== "443") || u.username || u.password) return null;
      await assertPublic(u.hostname);
      const res = await fetch(u, { redirect: "manual", headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "fr-FR,fr;q=0.9" }, signal: AbortSignal.timeout(Math.min(6000, left)), cache: "no-store" });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        url = new URL(loc, u).href;
        continue;
      }
      if (!res.ok || !/html|xml|text\/plain/i.test(res.headers.get("content-type") ?? "")) return null;
      const reader = res.body?.getReader();
      if (!reader) return null;
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        size += value.length;
      }
      await reader.cancel().catch(() => {});
      return { html: Buffer.concat(chunks).toString("utf8"), url: u.href };
    } catch {
      return null;
    }
  }
  return null;
}
