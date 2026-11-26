import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { parseVisual } from "@/lib/post-visual";
import { postImageResponse } from "@/server/post-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Image du post (PNG 1200 × 1200). Réservée à l'utilisateur connecté ; « ?download=1 » propose l'enregistrement. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await ctx.params;
  const p = (await db.select({ visual: schema.posts.visual, date: schema.posts.date }).from(schema.posts).where(eq(schema.posts.id, id)).limit(1))[0];
  const v = p ? parseVisual(p.visual) : null;
  if (!p || !v) return new Response("Image introuvable", { status: 404 });
  const res = postImageResponse(v);
  const headers = new Headers(res.headers);
  headers.set("cache-control", "private, no-store");
  if (new URL(req.url).searchParams.get("download")) headers.set("content-disposition", `attachment; filename="linkedin-${p.date}.png"`);
  return new Response(res.body, { status: 200, headers });
}
