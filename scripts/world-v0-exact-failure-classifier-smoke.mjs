import { classifyWorldV0ExactFailure } from "./world-v0-exact-failure-classifier.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cleanEvidence() {
  return {
    verdict: "WORLD_V0_FAIL_REAL_CHROMIUM",
    error: "Error: client 1 exact-state qualification timeout · last=false",
    clients: [0, 1].map((index) => ({
      index,
      evidence: {
        runtimeFailed: false,
        runtimeFailureReason: null,
        metrics: {
          guardMismatches: 0,
          guardPending: 0,
          remapFailures: 0,
          firstStateMismatch: null,
          serverRejected: 0,
        },
      },
    })),
  };
}

const retryable = classifyWorldV0ExactFailure(cleanEvidence());
assert(
  retryable.retryable === true && retryable.classification === "clean_hosted_starvation",
  `clean timeout ${JSON.stringify(retryable)}`,
);

const mutations = [
  ["runtime failure", (e) => { e.clients[0].evidence.runtimeFailed = true; e.clients[0].evidence.runtimeFailureReason = "boom"; }],
  ["guard mismatch", (e) => { e.clients[0].evidence.metrics.guardMismatches = 1; }],
  ["pending guard", (e) => { e.clients[1].evidence.metrics.guardPending = 1; }],
  ["remap failure", (e) => { e.clients[0].evidence.metrics.remapFailures = 1; }],
  ["first mismatch", (e) => { e.clients[1].evidence.metrics.firstStateMismatch = { path: "prop-1.position.x" }; }],
  ["server rejected", (e) => { e.clients[0].evidence.metrics.serverRejected = 1; }],
  ["non-timeout", (e) => { e.error = "Error: guard diverged"; }],
  ["missing client", (e) => { e.clients.pop(); }],
  ["wrong verdict", (e) => { e.verdict = "WORLD_V0_PASS_REAL_CHROMIUM"; }],
];

for (const [label, mutate] of mutations) {
  const evidence = cleanEvidence();
  mutate(evidence);
  const result = classifyWorldV0ExactFailure(evidence);
  assert(
    result.retryable === false && result.classification === "fatal",
    `${label} unexpectedly retryable: ${JSON.stringify(result)}`,
  );
}

console.log("WORLD_V0_EXACT_FAILURE_CLASSIFIER_SMOKE_PASS", JSON.stringify({ fatalCases: mutations.length }));
