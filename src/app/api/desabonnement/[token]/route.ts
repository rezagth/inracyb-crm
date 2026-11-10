import { NextResponse, type NextRequest } from "next/server";
import { readOptoutToken } from "@/lib/campaign";
import { recordOptout } from "@/server/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const page = (title: string, body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;color:#1a1a1a"><h1 style="font-size:20px">${title}</h1>${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

function emailOf(token: string): string | null {
  const secret = (process.env.AUTH_SECRET || "").trim();
  return secret.length >= 16 ? readOptoutToken(secret, token) : null;
}

/** Page de confirmation : un simple affichage ne désinscrit pas (les antivirus ouvrent les liens des mails). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const email = emailOf((await ctx.params).token);
  if (!email) return page("Lien invalide", "<p>Ce lien de désinscription n'est pas valide. Répondez simplement « stop » au mail reçu.</p>", 400);
  return page("Se désinscrire", `<p>Ne plus recevoir de messages d'InfraCyb à l'adresse <strong>${email.replace(/[<>&"]/g, "")}</strong> ?</p><form method="post"><button style="padding:10px 18px;font-size:15px;cursor:pointer">Me désinscrire</button></form>`);
}

/** Désinscription (bouton de la page, ou « un clic » du client mail via List-Unsubscribe-Post). */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const email = emailOf((await ctx.params).token);
  if (!email) return page("Lien invalide", "<p>Ce lien de désinscription n'est pas valide. Répondez simplement « stop » au mail reçu.</p>", 400);
  await recordOptout(email, "lien");
  return page("C'est fait", "<p>Vous ne recevrez plus de messages d'InfraCyb. Désolé du dérangement.</p>");
}
