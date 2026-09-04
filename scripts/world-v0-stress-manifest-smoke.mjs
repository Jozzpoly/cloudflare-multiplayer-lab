import {
  WORLD_V0_STRESS_MANIFEST_REVISION,
  WORLD_V0_STRESS_SCENARIOS,
  generateStressManifest,
  stressChaosDNA,
  validateStressManifest,
} from "../public/world-v0-stress/phenomenon-manifest.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const evidence = {
  verdict: "WORLD_V0_STRESS_MANIFEST_FAIL",
  revision: WORLD_V0_STRESS_MANIFEST_REVISION,
  scenarios: {},
};

for (const scenario of WORLD_V0_STRESS_SCENARIOS) {
  const args = { scenario, count: 96, seed: 0x51f15e, durationTicks: 144 };
  const a = generateStressManifest(args);
  const b = generateStressManifest(args);
  validateStressManifest(a);
  assert(JSON.stringify(a) === JSON.stringify(b), `${scenario}: same Chaos DNA did not reproduce byte-identical manifest`);
  assert(a.phenomenonId === b.phenomenonId, `${scenario}: same args changed phenomenonId`);

  const changedSeed = generateStressManifest({ ...args, seed: args.seed + 1 });
  const changedCount = generateStressManifest({ ...args, count: 97 });
  assert(changedCount.phenomenonId !== a.phenomenonId, `${scenario}: count change did not change phenomenonId`);
  if (scenario !== "quiet-width") {
    assert(changedSeed.phenomenonId !== a.phenomenonId, `${scenario}: seed change did not change phenomenonId`);
  }

  if (scenario === "wake-churn") {
    assert(a.events.length > 0, "wake-churn: no scheduled events");
    assert(a.events.every((event) => a.bodies.some((body) => body.id === event.bodyId)), "wake-churn: event targets missing body");
  } else {
    assert(a.events.length === 0, `${scenario}: unexpected scheduled events`);
  }

  evidence.scenarios[scenario] = {
    phenomenonId: a.phenomenonId,
    chaosDNA: stressChaosDNA(a),
    bodies: a.bodies.length,
    events: a.events.length,
    changedSeedId: changedSeed.phenomenonId,
    changedCountId: changedCount.phenomenonId,
  };
}

evidence.verdict = "WORLD_V0_STRESS_MANIFEST_PASS";
console.log(JSON.stringify(evidence, null, 2));
