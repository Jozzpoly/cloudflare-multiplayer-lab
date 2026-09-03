import assert from "node:assert/strict";
import { deriveWorldV0AuthorityProbe } from "./world-v0-authority-stimulus.mjs";

function dynamic(id, position, sessionId = undefined) {
  return {
    id,
    netEntityId: id,
    sessionId,
    position,
  };
}

const baseState = {
  players: [
    dynamic("actor:0", [-6.5, 0.82, -1.4], "session-slot-0"),
    dynamic("actor:1", [6.5, 0.82, 0.0], "session-slot-1"),
  ],
  props: [
    dynamic("prop-0", [-0.96, 0.46, -0.48]),
    dynamic("prop-1", [0, 0.46, -0.48]),
    dynamic("prop-2", [0.96, 0.46, -0.48]),
    dynamic("prop-3", [-0.96, 0.46, 0.48]),
    dynamic("prop-4", [0, 0.46, 0.48]),
    dynamic("prop-5", [0.96, 0.46, 0.48]),
    ...Array.from({ length: 6 }, (_, index) => dynamic(`prop-${index + 6}`, [8 + index, 0.6, 4])),
  ],
};

const peerOrderA = [
  { peerIndex: 0, welcome: { slot: 0, selfSessionId: "session-slot-0" } },
  { peerIndex: 1, welcome: { slot: 1, selfSessionId: "session-slot-1" } },
];
const peerOrderB = [peerOrderA[1], peerOrderA[0]];

function deriveBySession(peers, state) {
  return new Map(peers.map((peer) => [
    peer.welcome.selfSessionId,
    deriveWorldV0AuthorityProbe(state, peer.welcome.selfSessionId),
  ]));
}

const canonical = deriveBySession(peerOrderA, baseState);
const peerPermuted = deriveBySession(peerOrderB, baseState);
const statePermuted = deriveBySession(peerOrderB, {
  ...baseState,
  players: [...baseState.players].reverse(),
  props: [...baseState.props].reverse(),
});

for (const sessionId of ["session-slot-0", "session-slot-1"]) {
  assert.deepEqual(peerPermuted.get(sessionId), canonical.get(sessionId), `${sessionId}: peer-array order changed probe`);
  assert.deepEqual(statePermuted.get(sessionId), canonical.get(sessionId), `${sessionId}: B(0) entity order changed probe`);

  const probe = canonical.get(sessionId);
  const actorToTarget = [
    probe.target[0] - probe.actorPosition[0],
    probe.target[2] - probe.actorPosition[2],
  ];
  const dot = actorToTarget[0] * probe.input.x + actorToTarget[1] * probe.input.z;
  assert(dot > 0, `${sessionId}: probe does not point toward central interaction target`);
  assert(Math.abs(Math.hypot(probe.input.x, probe.input.z) - 1) < 1e-12, `${sessionId}: probe is not normalized`);
}

assert.notDeepEqual(
  canonical.get("session-slot-0").input,
  canonical.get("session-slot-1").input,
  "asymmetric B(0) actors unexpectedly received identical probe vectors",
);

assert.throws(
  () => deriveWorldV0AuthorityProbe(baseState, "missing-session"),
  /could not find controlled actor/,
  "missing controlled actor must fail closed",
);

const missingCentralProp = {
  ...baseState,
  props: baseState.props.filter((prop) => prop.id !== "prop-3"),
};
assert.throws(
  () => deriveWorldV0AuthorityProbe(missingCentralProp, "session-slot-0"),
  /missing central interaction prop prop-3/,
  "incomplete central interaction target must fail closed",
);

console.log(`WORLD V0 AUTHORITY STIMULUS PERMUTATION PASS · ${JSON.stringify({
  target: canonical.get("session-slot-0").target,
  slot0Input: canonical.get("session-slot-0").input,
  slot1Input: canonical.get("session-slot-1").input,
})}`);
