import "server-only";
import { ImageResponse } from "next/og";
import { bigFontSize, type PostVisual } from "@/lib/post-visual";

/** Image carrée 1200 × 1200 d'un post LinkedIn (phase Q) : surtitre, chiffre ou phrase forte, légende, signature. */
export function postImageResponse(v: PostVisual): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 96, background: "linear-gradient(145deg, #0b1220 0%, #10213a 60%, #0d3b4a 100%)", color: "#f8fafc", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: "#2dd4bf" }} />
          <div style={{ fontSize: 40, letterSpacing: 4, textTransform: "uppercase", color: "#5eead4" }}>{v.kicker || "InfraCyb"}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          <div style={{ fontSize: bigFontSize(v.big), fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{v.big}</div>
          {v.sub && <div style={{ fontSize: 52, lineHeight: 1.3, color: "#cbd5e1", maxWidth: 980 }}>{v.sub}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: "2px solid rgba(148,163,184,0.35)", paddingTop: 36 }}>
          <div style={{ fontSize: 44, fontWeight: 700 }}>InfraCyb</div>
          <div style={{ fontSize: 36, color: "#94a3b8" }}>infracyb.fr · cybersécurité des TPE et PME</div>
        </div>
      </div>
    ),
    { width: 1200, height: 1200 },
  );
}

/** Même image, en PNG, pour la pièce jointe du mail. */
export async function postImagePng(v: PostVisual): Promise<Buffer> {
  return Buffer.from(await postImageResponse(v).arrayBuffer());
}
