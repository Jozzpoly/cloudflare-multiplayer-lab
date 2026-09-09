import assert from "node:assert/strict";
import {
  WORLD_V0_SESSION_CONTINUITY_REVISION,
  clearWorldV0StoredSession,
  readWorldV0StoredSession,
  takeWorldV0ResumeIntent,
  worldV0StoredSessionMatchesRoom,
  writeWorldV0ResumeIntent,
  writeWorldV0StoredSession,
} from "../public/world-v0/session-continuity.js";
import {
  WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION,
  normalizeWorldV0PublicRoomDirectory,
  worldV0PublicRoomPresentation,
} from "../public/world-v0/public-room-entry.js";

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

const local = new MemoryStorage();
const session = new MemoryStorage();
const actor = {
  revision: WORLD_V0_SESSION_CONTINUITY_REVISION,
  runKey: "yard-3",
  playerId: "Jozz",
  worldEpoch: "epoch-a",
  sessionId: "session-a",
  resumeToken: "resume-secret-a",
  netEntityId: "actor:1",
  slot: 1,
};

assert.equal(WORLD_V0_SESSION_CONTINUITY_REVISION, "world-v0-session-continuity-r3-live-rebind");
assert.equal(writeWorldV0StoredSession(actor, local), true);
assert.deepEqual(readWorldV0StoredSession("yard-3", local), { ...actor, savedAt: readWorldV0StoredSession("yard-3", local).savedAt });
assert.equal(readWorldV0StoredSession("yard-2", local), null);

// Private token ownership follows the live WorldEpoch instead of waiting for the
// public directory to classify that exact slot as disconnected/reserved.
assert.equal(worldV0StoredSessionMatchesRoom(actor, { id: "yard-3", worldEpoch: "epoch-a", reservedSlots: [1] }), true);
assert.equal(worldV0StoredSessionMatchesRoom(actor, { id: "yard-3", worldEpoch: "epoch-a", reservedSlots: [0] }), true);
assert.equal(worldV0StoredSessionMatchesRoom(actor, { id: "yard-3", worldEpoch: "epoch-a", reservedSlots: [] }), true);
assert.equal(worldV0StoredSessionMatchesRoom(actor, { id: "yard-3", worldEpoch: "epoch-b", reservedSlots: [1] }), false);
assert.equal(worldV0StoredSessionMatchesRoom(actor, { id: "yard-2", worldEpoch: "epoch-a", reservedSlots: [1] }), false);

assert.equal(writeWorldV0ResumeIntent(actor, session), true);
assert.equal(takeWorldV0ResumeIntent({ runKey: "yard-3", playerId: "Wrong" }, session), null);
assert.equal(takeWorldV0ResumeIntent({ runKey: "yard-3", playerId: "Jozz" }, session), null, "resume intent is one-shot even on mismatch");
assert.equal(writeWorldV0ResumeIntent(actor, session), true);
assert.deepEqual(takeWorldV0ResumeIntent({ runKey: "yard-3", playerId: "Jozz" }, session), { ...actor, savedAt: null });
assert.equal(clearWorldV0StoredSession("yard-3", "wrong-epoch", local), false);
assert.notEqual(readWorldV0StoredSession("yard-3", local), null);
assert.equal(clearWorldV0StoredSession("yard-3", "epoch-a", local), true);
assert.equal(readWorldV0StoredSession("yard-3", local), null);

// Existing qualified R2 browser profiles must migrate without losing the private
// ActorSession token just because the client-side matching contract was revised.
const legacy = new MemoryStorage();
legacy.setItem("shared-yard-v0-actor-sessions-v1", JSON.stringify({
  revision: "world-v0-session-continuity-r2-slot-bound",
  sessions: {
    "yard-3": {
      revision: "world-v0-session-continuity-r2-slot-bound",
      runKey: "yard-3",
      playerId: "Jozz",
      worldEpoch: "epoch-a",
      sessionId: "session-a",
      resumeToken: "resume-secret-a",
      netEntityId: "actor:1",
      slot: 1,
      savedAt: "2026-09-09T00:00:00.000Z",
    },
  },
}));
const migrated = readWorldV0StoredSession("yard-3", legacy);
assert.equal(migrated?.revision, WORLD_V0_SESSION_CONTINUITY_REVISION);
assert.equal(migrated?.resumeToken, "resume-secret-a");
assert.equal(migrated?.slot, 1);

const rooms = normalizeWorldV0PublicRoomDirectory({
  revision: WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION,
  rooms: [
    { id: "yard-1", name: "Yard 1", occupancy: 0, connected: 0, reserved: 0, reservedSlots: [], capacity: 2, state: "empty", joinable: true, worldEpoch: null },
    { id: "yard-2", name: "Yard 2", occupancy: 2, connected: 2, reserved: 0, reservedSlots: [], capacity: 2, state: "live", joinable: false, worldEpoch: "epoch-2" },
    { id: "yard-3", name: "Yard 3", occupancy: 2, connected: 1, reserved: 1, reservedSlots: [1], capacity: 2, state: "live-reserved", joinable: false, worldEpoch: "epoch-a" },
  ],
});
assert.deepEqual(worldV0PublicRoomPresentation(rooms[2]), {
  status: "1/2 online · 1 reserved",
  action: "In session",
  joinable: false,
  tone: "reserved",
});
assert.deepEqual(worldV0PublicRoomPresentation(rooms[2], { resumable: true }), {
  status: "1/2 online · Your session",
  action: "Resume",
  joinable: true,
  tone: "resume",
});
assert.deepEqual(worldV0PublicRoomPresentation(rooms[1], { resumable: true }), {
  status: "2/2 · Your session",
  action: "Resume",
  joinable: true,
  tone: "resume",
});

console.log("WORLD_V0_SESSION_CONTINUITY_R3_SMOKE_PASS");
