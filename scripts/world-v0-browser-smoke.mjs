import assert from "node:assert/strict";
import {
  WORLD_V0_CLIENT_SIM_REVISION,
  WORLD_V0_NET_ENTITY_ORDER,
  WORLD_V0_PROTOCOL_REVISION,
  WORLD_V0_SERVER_REVISION,
  WORLD_V0_SIM_BUILD_ID,
  WORLD_V0_STATE_COMPONENTS,
  WORLD_V0_STATE_GUARD_REVISION,
} from "../src/world-v0-contract.ts";
import {
  WORLD_V0_CLIENT_SIM_REVISION as BROWSER_CLIENT_SIM_REVISION,
  WORLD_V0_EXPECTED_PROTOCOL_REVISION,
  WORLD_V0_EXPECTED_SERVER_REVISION,
  WORLD_V0_EXPECTED_SIM_BUILD_ID,
  WORLD_V0_EXPECTED_STATE_GUARD_REVISION,
} from "../public/world-v0/build-contract.js";
import {
  firstWorldV0StateDifference,
  packWorldV0State,
} from "../public/world-v0/state-guard.js";

assert.equal(BROWSER_CLIENT_SIM_REVISION, WORLD_V0_CLIENT_SIM_REVISION);
assert.equal(WORLD_V0_EXPECTED_SERVER_REVISION, WORLD_V0_SERVER_REVISION);
assert.equal(WORLD_V0_EXPECTED_PROTOCOL_REVISION, WORLD_V0_PROTOCOL_REVISION);
assert.equal(WORLD_V0_EXPECTED_STATE_GUARD_REVISION, WORLD_V0_STATE_GUARD_REVISION);
assert.equal(WORLD_V0_EXPECTED_SIM_BUILD_ID, WORLD_V0_SIM_BUILD_ID);

const valueByEntity = new Map();
for (let entityIndex = 0; entityIndex < WORLD_V0_NET_ENTITY_ORDER.length; entityIndex += 1) {
  valueByEntity.set(
    WORLD_V0_NET_ENTITY_ORDER[entityIndex],
    WORLD_V0_STATE_COMPONENTS.map((_, componentIndex) => entityIndex * 100 + componentIndex + 0.25),
  );
}

const baseline = packWorldV0State(
  WORLD_V0_NET_ENTITY_ORDER,
  WORLD_V0_STATE_COMPONENTS,
  (id) => valueByEntity.get(id),
);
assert.equal(baseline.length, WORLD_V0_NET_ENTITY_ORDER.length * WORLD_V0_STATE_COMPONENTS.length * 8);
assert.equal(firstWorldV0StateDifference(
  baseline,
  baseline,
  WORLD_V0_NET_ENTITY_ORDER,
  WORLD_V0_STATE_COMPONENTS,
), null);

const perturbed = new Map([...valueByEntity].map(([id, values]) => [id, [...values]]));
const targetEntity = "prop-7";
const targetComponent = "angularVelocity.z";
const targetComponentIndex = WORLD_V0_STATE_COMPONENTS.indexOf(targetComponent);
perturbed.get(targetEntity)[targetComponentIndex] += 0.5;
const changed = packWorldV0State(
  WORLD_V0_NET_ENTITY_ORDER,
  WORLD_V0_STATE_COMPONENTS,
  (id) => perturbed.get(id),
);
const difference = firstWorldV0StateDifference(
  baseline,
  changed,
  WORLD_V0_NET_ENTITY_ORDER,
  WORLD_V0_STATE_COMPONENTS,
);
assert(difference);
assert.equal(difference.netEntityId, targetEntity);
assert.equal(difference.component, targetComponent);
assert.notEqual(difference.referenceBits, difference.candidateBits);

console.log(`WORLD V0 BROWSER SMOKE PASS · sim=${WORLD_V0_EXPECTED_SIM_BUILD_ID} · exact f32 guard detects ${targetEntity}.${targetComponent}`);
