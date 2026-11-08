// Export de secours : pg_dump au format « custom », dans data/backups/ (ignoré par git, à ranger chiffré hors du Mac).
// Neon garde aussi un historique et des branches : voir sa console. Nécessite l'outil pg_dump installé.
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadEnv } from "./load-env";

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquante");
const dir = resolve(process.cwd(), "data/backups");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const target = join(dir, `infracyb-${stamp}.dump`);
const r = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--file", target, url], { stdio: ["ignore", "inherit", "inherit"] });
if (r.error || r.status !== 0) {
  console.error("✗ Échec : pg_dump est-il installé ? (macOS : brew install libpq)");
  process.exit(1);
}
const all = readdirSync(dir).filter((f) => f.endsWith(".dump")).sort();
for (const old of all.slice(0, Math.max(0, all.length - 30))) rmSync(join(dir, old));
console.log("✓ Sauvegarde créée :", target);
