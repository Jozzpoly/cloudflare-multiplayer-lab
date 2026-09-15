import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const CONFIG = "wrangler.foundation-replication-physics-test.jsonc";
const BASE_MAIN = '"main": "src/multiplayer-foundation/replication-physics-test-worker.ts"';
const DIAGNOSTIC_MAIN = '"main": "scripts/fixtures/multiplayer-foundation-future-diagnostic-worker.ts"';

const config = readFileSync(CONFIG, "utf8");
if (!config.includes(BASE_MAIN)) throw new Error("future-equivalence control could not locate base worker main");
writeFileSync(CONFIG, config.replace(BASE_MAIN, DIAGNOSTIC_MAIN));

const originalFetch = globalThis.fetch.bind(globalThis);
let emittedKey = null;

globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  try {
    const input = args[0];
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    if (url.includes("/foundation-physics/status")) {
      const body = await response.clone().json();
      const diagnostic = body?.diagnosticFuture;
      if (diagnostic?.revision === "multiplayer-foundation-future-equivalence-v2") {
        const evidence = {
          sourceSeedBytes: diagnostic.sourceSeedBytes,
          sourceSeedFnv1a32: diagnostic.sourceSeedFnv1a32,
          initialGuardSha256: createHash("sha256").update(diagnostic.initialGuardPacked).digest("hex"),
          futureGuardSha256: createHash("sha256").update(diagnostic.futureGuardPacked).digest("hex"),
          futureSeedBytes: diagnostic.futureSeedBytes,
          futureSeedFnv1a32: diagnostic.futureSeedFnv1a32,
          futurePhysicsSteps: diagnostic.futurePhysicsSteps,
          secondInitialGuardSha256: createHash("sha256").update(diagnostic.secondInitialGuardPacked).digest("hex"),
          secondFutureGuardSha256: createHash("sha256").update(diagnostic.secondFutureGuardPacked).digest("hex"),
          secondFutureSeedBytes: diagnostic.secondFutureSeedBytes,
          secondFutureSeedFnv1a32: diagnostic.secondFutureSeedFnv1a32,
          secondFuturePhysicsSteps: diagnostic.secondFuturePhysicsSteps,
        };
        const key = JSON.stringify(evidence);
        if (key !== emittedKey) {
          emittedKey = key;
          console.log("MULTIPLAYER_FOUNDATION_FUTURE_EQUIVALENCE_CONTROL", key);
        }
      }
    }
  } catch {
    // Diagnostic observation must never alter the control specimen.
  }
  return response;
};

await import("./multiplayer-foundation-local-reconnect-physics-transport-smoke.mjs");
if (emittedKey === null) throw new Error("future-equivalence control produced no diagnostic evidence");
