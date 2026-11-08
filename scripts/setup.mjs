// Prépare le fichier .env au premier lancement : génère un secret de session aléatoire.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const path = ".env";
let content = existsSync(path) ? readFileSync(path, "utf8") : readFileSync(".env.example", "utf8");

if (!/^DATABASE_URL=/m.test(content)) content += '\nDATABASE_URL=""\n';

const secretLine = content.match(/^AUTH_SECRET="?([^"\n]*)"?$/m);
if (!secretLine || !secretLine[1]) {
  const secret = randomBytes(48).toString("base64url");
  content = secretLine ? content.replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET="${secret}"`) : content + `\nAUTH_SECRET="${secret}"\n`;
  console.log("✓ Secret de session généré dans .env");
} else {
  console.log("✓ Secret de session déjà présent, conservé");
}

writeFileSync(path, content, { mode: 0o600 });
console.log("✓ Fichier .env prêt (droits restreints)");
