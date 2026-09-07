import { readFileSync, writeFileSync } from "node:fs";

const PATH = "scripts/.world-v0-playability-input-shape-probe.mjs";
let source = readFileSync(PATH, "utf8");

function replaceUnique(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor missing`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: anchor not unique`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceUnique(
  `    rttMedianMs: end.rtt?.medianMs ?? null,\n    rttP95Ms: end.rtt?.p95Ms ?? null,`,
  `    rttMedianMs: end.rtt?.medianMs ?? null,\n    rttP95Ms: end.rtt?.p95Ms ?? null,\n    startNetworkState: start.networkState ?? null,\n    startWorldEpoch: start.identity?.worldEpoch ?? null,\n    finalWorldEpoch: end.identity?.worldEpoch ?? null,\n    finalProtocolStartTick: end.protocolStartTick ?? null,\n    maxAuthoritySilenceTicks: end.metrics?.maxAuthoritySilenceTicks ?? null,\n    actorResume: end.session?.actorResume ? JSON.parse(JSON.stringify(end.session.actorResume)) : null,\n    lifecycleEvents: Array.isArray(end.lifecycleEvents) ? end.lifecycleEvents.map((event) => ({ ...event })) : [],`,
  "resume forensic summary",
);

writeFileSync(PATH, source);
console.log("WORLD_V0_PLAYABILITY_RESUME_FORENSICS_PREPARED");
