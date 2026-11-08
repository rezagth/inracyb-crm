import { loadEnv } from "./load-env";

loadEnv();
// "server-only" n'existe que dans Next.js : on le neutralise pour ce script.
import Module from "node:module";
const origLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return origLoad.call(this, request, ...rest);
};

async function main() {
  const { syncStratcyber } = await import("../src/server/stratcyber-sync");
  const r = await syncStratcyber();
  console.log(r.message);
  process.exit(r.ok ? 0 : 1);
}
await main();
