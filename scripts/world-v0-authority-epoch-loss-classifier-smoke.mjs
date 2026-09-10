import { classifyWorldV0AuthorityEpoch } from "../public/world-v0/authority-epoch-loss.js";

function assert(value, message) { if (!value) throw new Error(message); }
const sourceEpoch = "source-epoch";
const cases = [
  [{ sourceEpoch, directoryReachable: false, room: null }, "unknown", "directory-unreachable"],
  [{ sourceEpoch, directoryReachable: true, room: null }, "unknown", "room-missing"],
  [{ sourceEpoch, directoryReachable: true, room: { state: "unavailable", worldEpoch: null } }, "unknown", "room-unavailable"],
  [{ sourceEpoch, directoryReachable: true, room: { state: "live", worldEpoch: sourceEpoch } }, "same-epoch", "authority-still-reports-source"],
  [{ sourceEpoch, directoryReachable: true, room: { state: "empty", worldEpoch: null } }, "epoch-gone", "authority-reports-no-epoch"],
  [{ sourceEpoch, directoryReachable: true, room: { state: "waiting", worldEpoch: "replacement-epoch" } }, "epoch-gone", "authority-reports-replacement"],
];
for (const [input, kind, reason] of cases) {
  const result = classifyWorldV0AuthorityEpoch(input);
  assert(result.kind === kind, `expected ${kind}, got ${JSON.stringify(result)}`);
  assert(result.reason === reason, `expected ${reason}, got ${JSON.stringify(result)}`);
}
console.log("WORLD_V0_AUTHORITY_EPOCH_LOSS_CLASSIFIER_PASS", JSON.stringify({ cases: cases.length }));
