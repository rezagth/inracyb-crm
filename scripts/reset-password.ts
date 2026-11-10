import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { loadEnv } from "./load-env";

/**
 * Réinitialise le mot de passe d'un compte du CRM (mot de passe oublié).
 *   npm run auth:reset
 * Le mot de passe est saisi de façon masquée (jamais dans la commande ni dans l'historique du terminal).
 * Toutes les sessions ouvertes sont déconnectées et le blocage de connexion est levé.
 */

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const mute = new Writable({ write: (_c, _e, cb) => cb() });
    const rl = createInterface({ input: process.stdin, output: hidden ? mute : process.stdout, terminal: hidden });
    rl.question("", (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  loadEnv();

  // Mode sans connexion (npm run auth:reset -- --sql) : génère la requête SQL à coller dans l'éditeur SQL de Neon,
  // utile quand le port 5432 est bloqué depuis ce réseau. Le mot de passe reste masqué ; seul son hash est affiché.
  if (process.argv.includes("--sql")) {
    const mail = (await ask("E-mail du compte : ")).trim().toLowerCase();
    if (!/^[^\s@'";]+@[^\s@'";]+\.[^\s@'";]+$/.test(mail)) throw new Error("E-mail invalide.");
    const pw1 = await ask("Nouveau mot de passe (12 caractères minimum, masqué) : ", true);
    if (pw1.length < 12) throw new Error("12 caractères minimum.");
    if (pw1.length > 200) throw new Error("200 caractères maximum.");
    if (pw1 !== (await ask("Confirme le mot de passe : ", true))) throw new Error("Les deux saisies ne correspondent pas.");
    const hash = await bcrypt.hash(pw1, 12);
    console.log("\nColle ceci dans l'éditeur SQL de Neon (base du CRM), puis exécute :\n");
    console.log(`UPDATE users SET password_hash = '${hash}', session_version = session_version + 1, failed_logins = 0, locked_until = NULL WHERE lower(email) = '${mail}';`);
    console.log("\nNeon doit répondre « 1 row affected » (0 = mauvaise base ou e-mail inexact).");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error("DATABASE_URL manquante ou invalide dans .env");
  const host = new URL(url).hostname;

  console.log(`Base visée : ${host}`);
  console.log("(Si c'est la base de production, c'est elle qui sera modifiée.)\n");

  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 20_000 });
  const db = drizzle(pool, { schema });
  try {
    const users = await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name }).from(schema.users);
    if (!users.length) throw new Error("Aucun compte dans cette base : crée-le d'abord sur /setup.");
    console.log("Comptes existants :");
    users.forEach((u) => console.log(`  - ${u.email} (${u.name})`));

    const typed = (await ask("\nE-mail du compte à réinitialiser" + (users.length === 1 ? ` [Entrée = ${users[0].email}] : ` : " : "))).trim().toLowerCase();
    const email = typed || (users.length === 1 ? users[0].email : "");
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error("Aucun compte avec cet e-mail.");

    const pw = await ask("Nouveau mot de passe (12 caractères minimum, masqué) : ", true);
    if (pw.length < 12) throw new Error("12 caractères minimum.");
    if (pw.length > 200) throw new Error("200 caractères maximum.");
    const again = await ask("Confirme le mot de passe : ", true);
    if (pw !== again) throw new Error("Les deux saisies ne correspondent pas.");

    const ok = (await ask(`Réinitialiser le mot de passe de ${user.email} sur ${host} ? Tape « oui » : `)).trim().toLowerCase();
    if (ok !== "oui") throw new Error("Annulé, rien n'a été modifié.");

    await db
      .update(schema.users)
      .set({ passwordHash: await bcrypt.hash(pw, 12), sessionVersion: sql`${schema.users.sessionVersion} + 1`, failedLogins: 0, lockedUntil: null })
      .where(eq(schema.users.id, user.id));
    console.log(`\n✓ Mot de passe de ${user.email} réinitialisé. Les sessions ouvertes sont déconnectées : connecte-toi avec le nouveau mot de passe.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("\n✗", e instanceof Error ? e.message : e);
  // drizzle enveloppe l'erreur réelle (Postgres ou réseau) dans `cause` : on l'affiche pour comprendre la panne.
  let c: unknown = e instanceof Error ? e.cause : undefined;
  for (let depth = 0; c && depth < 3; depth++) {
    const x = c as { name?: string; message?: string; code?: string; address?: string; port?: number; errors?: unknown[]; cause?: unknown };
    console.error(`  Cause : ${x.name ?? "Error"} ${x.code ? `[${x.code}] ` : ""}${x.message ?? ""}${x.address ? ` (${x.address}:${x.port})` : ""}`.trimEnd());
    (x.errors ?? []).forEach((s) => {
      const y = s as { code?: string; message?: string; address?: string; port?: number };
      console.error(`    - ${y.code ?? ""} ${y.message ?? ""} ${y.address ? `(${y.address}:${y.port})` : ""}`.trimEnd());
    });
    c = x.cause;
  }
  process.exit(1);
});
