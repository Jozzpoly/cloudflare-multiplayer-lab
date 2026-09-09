import { classifyWorldV0JoinFailure } from "../public/world-v0/join-failure-clarity.js";

function assert(value, message) { if (!value) throw new Error(message); }

const cases = [
  {
    name: "service unreachable",
    input: { directoryReachable: false, room: null },
    kind: "service-unreachable",
  },
  {
    name: "full",
    input: { directoryReachable: true, room: { state: "live", connected: 2, reserved: 0, capacity: 2, joinable: false } },
    kind: "capacity-full",
  },
  {
    name: "protected reconnect",
    input: { directoryReachable: true, room: { state: "waiting-reserved", connected: 1, reserved: 1, capacity: 2, joinable: false } },
    kind: "lifecycle-protected",
  },
  {
    name: "busy",
    input: { directoryReachable: true, room: { state: "live", connected: 1, reserved: 0, capacity: 2, joinable: false } },
    kind: "lifecycle-busy",
  },
  {
    name: "joinable but websocket failed",
    input: { directoryReachable: true, room: { state: "waiting", connected: 1, reserved: 0, capacity: 2, joinable: true } },
    kind: "connection-handshake",
  },
  {
    name: "authority unavailable",
    input: { directoryReachable: true, room: { state: "unavailable", connected: 0, reserved: 0, capacity: 2, joinable: false, failure: "probe failed" } },
    kind: "yard-unavailable",
  },
];

for (const test of cases) {
  const actual = classifyWorldV0JoinFailure(test.input);
  assert(actual.kind === test.kind, `${test.name}: expected ${test.kind}, got ${JSON.stringify(actual)}`);
  assert(typeof actual.message === "string" && actual.message.length > 20, `${test.name}: weak message`);
  assert(!actual.message.includes("active, full, or temporarily unreachable"), `${test.name}: old conflated copy survived`);
}

console.log("WORLD_V0_JOIN_FAILURE_CLARITY_SMOKE_PASS", JSON.stringify({ cases: cases.length }));
