import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const CONFIG = "wrangler.foundation-replication-physics-test.jsonc";
const BASE_MAIN = '"main": "src/multiplayer-foundation/replication-physics-test-worker.ts"';
const DIAGNOSTIC_MAIN = '"main": "scripts/fixtures/multiplayer-foundation-future-diagnostic-worker.ts"';
const LEGACY_REFERENCE = "b98daa7d";

const config = readFileSync(CONFIG, "utf8");
if (!config.includes(BASE_MAIN)) throw new Error("future-equivalence mid-progress probe could not locate base worker main");
writeFileSync(CONFIG, config.replace(BASE_MAIN, DIAGNOSTIC_MAIN));

const originalFetch = globalThis.fetch.bind(globalThis);
let observed = null;
let emittedKey = null;

globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  try {
    const input = args[0];
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    if (url.includes("/foundation-physics/status")) {
      const body = await response.clone().json();
      const diagnostic = body?.diagnosticFuture;
      if (diagnostic?.revision === "multiplayer-foundation-future-equivalence-v1") {
        observed = {
          sourceSeedBytes: diagnostic.sourceSeedBytes,
          sourceSeedFnv1a32: diagnostic.sourceSeedFnv1a32,
          initialGuardSha256: createHash("sha256").update(diagnostic.initialGuardPacked).digest("hex"),
          futureGuardSha256: createHash("sha256").update(diagnostic.futureGuardPacked).digest("hex"),
          futureSeedBytes: diagnostic.futureSeedBytes,
          futureSeedFnv1a32: diagnostic.futureSeedFnv1a32,
          futurePhysicsSteps: diagnostic.futurePhysicsSteps,
        };
        const key = JSON.stringify(observed);
        if (key !== emittedKey) {
          emittedKey = key;
          console.log("MULTIPLAYER_FOUNDATION_FUTURE_EQUIVALENCE_MIDPROGRESS", key);
        }
      }
    }
  } catch {
    // Diagnostic observation must never alter the existing falsifier.
  }
  return response;
};

try {
  await import("./multiplayer-foundation-midprogress-hibernation-probe.ts");
} catch (error) {
  if (
    observed
    && error?.code === "ERR_ASSERTION"
    && error?.actual === observed.sourceSeedFnv1a32
    && error?.expected === LEGACY_REFERENCE
  ) {
    console.log("MULTIPLAYER_FOUNDATION_LEGACY_RECORDING_HASH_MISMATCH_OBSERVED", JSON.stringify({
      actual: error.actual,
      expected: error.expected,
      futureGuardSha256: observed.futureGuardSha256,
    }));
  } else {
    throw error;
  }
}

if (observed === null) throw new Error("future-equivalence mid-progress probe produced no diagnostic evidence");
