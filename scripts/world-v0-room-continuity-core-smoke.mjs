import {
  WORLD_V0_ROOM_CONTINUITY_ELIGIBLE_END_REASON,
  WORLD_V0_ROOM_CONTINUITY_REVISION,
  planWorldV0RoomContinuity,
  roomContinuityRequested,
} from "../public/world-v0/room-continuity.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function plan(overrides = {}) {
  return planWorldV0RoomContinuity({
    requested: true,
    entryMode: "host",
    inspectionMode: "multiplayer",
    runtimeFailed: false,
    endKind: "epoch-ended",
    endReason: WORLD_V0_ROOM_CONTINUITY_ELIGIBLE_END_REASON,
    restartAvailable: true,
    networkState: "closed 1012",
    pageVisible: true,
    online: true,
    worldEpoch: "epoch-a",
    alreadyAttempted: false,
    ...overrides,
  });
}

assert(WORLD_V0_ROOM_CONTINUITY_REVISION === "shared-yard-v0-room-continuity-probe-v1", "continuity revision drift");
assert(roomContinuityRequested("https://example.test/world-v0/?continuity=1") === true, "explicit probe query not detected");
assert(roomContinuityRequested("https://example.test/world-v0/") === false, "probe enabled without query");
assert(roomContinuityRequested("https://example.test/world-v0/?continuity=0") === false, "invalid probe query enabled");

const eligible = plan();
assert(eligible.action === "auto-rearm", `eligible plan rejected ${JSON.stringify(eligible)}`);
assert(eligible.worldEpoch === "epoch-a", "eligible epoch lost");
assert(String(eligible.ambiguity).includes("does-not-distinguish"), "authority close ambiguity must remain explicit evidence");

const holds = [
  ["probe disabled", { requested: false }, "probe-not-requested"],
  ["invite/friend role", { entryMode: "invite" }, "host-only-probe"],
  ["invalid invite role", { entryMode: "invalid-invite" }, "host-only-probe"],
  ["inspection", { inspectionMode: "inspection" }, "inspection-excluded"],
  ["runtime failure", { runtimeFailed: true }, "runtime-failure"],
  ["hidden page", { pageVisible: false }, "page-not-visible"],
  ["offline", { online: false }, "browser-offline"],
  ["transport close without epoch end", { endKind: "transport-close" }, "not-clean-epoch-end"],
  ["authority failure", { endReason: "authority_failure:boom" }, "end-reason-not-eligible"],
  ["peer websocket error", { endReason: "peer_error_restart_required" }, "end-reason-not-eligible"],
  ["identity mismatch", { endReason: "world_identity_mismatch:actor:1" }, "end-reason-not-eligible"],
  ["input lease expiry", { endReason: "input_lease_expired:actor:1" }, "end-reason-not-eligible"],
  ["socket not closed yet", { networkState: "epoch ended · peer_left_restart_required" }, "restart-not-ready"],
  ["restart helper false", { restartAvailable: false }, "restart-not-ready"],
  ["missing epoch", { worldEpoch: null }, "world-epoch-missing"],
  ["already attempted", { alreadyAttempted: true }, "epoch-already-attempted"],
];

for (const [label, overrides, expectedReason] of holds) {
  const value = plan(overrides);
  assert(value.action === "hold", `${label}: expected hold, got ${JSON.stringify(value)}`);
  assert(value.reason === expectedReason, `${label}: reason ${value.reason} != ${expectedReason}`);
}

console.log("WORLD_V0_ROOM_CONTINUITY_CORE_PASS", JSON.stringify({
  revision: WORLD_V0_ROOM_CONTINUITY_REVISION,
  eligibleReason: WORLD_V0_ROOM_CONTINUITY_ELIGIBLE_END_REASON,
  holdCases: holds.length,
}));
