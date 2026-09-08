import { readFileSync, writeFileSync } from "node:fs";

const path = "src/world-v0-shared-yard.ts";
let source = readFileSync(path, "utf8");

if (source.includes('this.endEpoch("peer_disconnected_before_start");')) {
  console.log("WORLD_V0_I1_PRESTART_APPLY already applied");
  process.exit(0);
}

if (!source.includes("resumeToken: string;") || !source.includes("sessionBySocket")) {
  throw new Error("I1 pre-start patch requires the ActorSession continuity runtime first");
}

const before = `    // Before canonical play starts there is no ticking lease to clean up an empty
    // run, so an entirely abandoned waiting room may end immediately.
    if (this.protocolStartTick === null && this.connectedPlayerCount() === 0) {
      this.endEpoch("all_players_disconnected_before_start");
    }`;
const after = `    // Before canonical play starts there is no ticking input lease and no earned
    // same-epoch run continuity yet. Preserve the old fail-closed waiting-room
    // behavior so a vanished peer cannot strand an occupied ActorSession slot.
    if (this.protocolStartTick === null) {
      this.endEpoch("peer_disconnected_before_start");
    }`;

const first = source.indexOf(before);
if (first < 0) throw new Error("I1 pre-start patch marker missing");
if (source.indexOf(before, first + before.length) >= 0) throw new Error("I1 pre-start patch marker ambiguous");
source = source.slice(0, first) + after + source.slice(first + before.length);

if (!source.includes('this.endEpoch("peer_disconnected_before_start");') ||
    source.includes('this.endEpoch("all_players_disconnected_before_start");')) {
  throw new Error("I1 pre-start patch postcondition failed");
}

writeFileSync(path, source);
console.log("WORLD_V0_I1_PRESTART_APPLY PASS");
