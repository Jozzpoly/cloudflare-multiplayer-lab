import { readFileSync, writeFileSync } from "node:fs";

await import("./apply-world-v0-vacant-capacity-refinement-v2.mjs");

const path = "scripts/world-v0-session-continuity-r3-smoke.mjs";
const source = readFileSync(path, "utf8");
const from = `assert.equal(WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION, "world-v0-public-room-directory-r3-soft-reservation");`;
const to = `assert.equal(WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION, "world-v0-public-room-directory-r4-vacant-capacity");`;
const first = source.indexOf(from);
if (first < 0 || source.indexOf(from, first + from.length) >= 0) {
  throw new Error("session continuity directory revision assertion was not exactly the expected stale value");
}
writeFileSync(path, source.slice(0, first) + to + source.slice(first + from.length));

console.log("WORLD_V0_VACANT_CAPACITY_REVISION_MIGRATION_APPLIED");
