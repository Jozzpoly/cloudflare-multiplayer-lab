import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const WORLD_V0_EXACT_FAILURE_CLASSIFIER_REVISION = "world-v0-exact-failure-classifier-v1";

function fatal(reason) {
  return { retryable: false, classification: "fatal", reason };
}

export function classifyWorldV0ExactFailure(evidence) {
  if (!evidence || typeof evidence !== "object") return fatal("evidence missing or invalid");
  if (evidence.verdict !== "WORLD_V0_FAIL_REAL_CHROMIUM") {
    return fatal(`unexpected verdict ${String(evidence.verdict)}`);
  }
  const error = String(evidence.error || "");
  if (!error.includes("exact-state qualification timeout")) {
    return fatal(`non-starvation exact failure: ${error || "missing error"}`);
  }
  if (!Array.isArray(evidence.clients) || evidence.clients.length !== 2) {
    return fatal("exact failure missing both client evidence records");
  }

  for (const client of evidence.clients) {
    const label = `client ${client?.index ?? "?"}`;
    const run = client?.evidence;
    if (!run || typeof run !== "object") return fatal(`${label} missing browser evidence`);
    const metrics = run.metrics || {};
    if (run.runtimeFailed !== false) {
      return fatal(`${label} runtimeFailed=${String(run.runtimeFailed)} reason=${String(run.runtimeFailureReason)}`);
    }
    if ((metrics.guardMismatches || 0) !== 0) return fatal(`${label} guard mismatches=${metrics.guardMismatches}`);
    if ((metrics.guardPending || 0) !== 0) return fatal(`${label} pending guards=${metrics.guardPending}`);
    if ((metrics.remapFailures || 0) !== 0) return fatal(`${label} remap failures=${metrics.remapFailures}`);
    if (metrics.firstStateMismatch != null) return fatal(`${label} first state mismatch present`);
    if ((metrics.serverRejected || 0) !== 0) return fatal(`${label} rejected records=${metrics.serverRejected}`);
  }

  return {
    retryable: true,
    classification: "clean_hosted_starvation",
    reason: "qualification timeout with two clean client evidence records",
  };
}

function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: node scripts/world-v0-exact-failure-classifier.mjs <evidence.json>");
  const evidence = JSON.parse(readFileSync(path, "utf8"));
  const result = classifyWorldV0ExactFailure(evidence);
  console.log("WORLD_V0_EXACT_FAILURE_CLASSIFICATION", JSON.stringify({
    revision: WORLD_V0_EXACT_FAILURE_CLASSIFIER_REVISION,
    ...result,
  }));
  if (!result.retryable) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
