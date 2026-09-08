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

assert.equal(writeWorldV0StoredSession(actor, local), true);
assert.deepEqual(readWorldV0StoredSession("yard-3", local), { ...actor, savedAt: readWorldV0StoredSession("yard-3", local).savedAt });
assert.equal(readWorldV0StoredSession("yard-2", local), null);
assert.equal(worldV0StoredSessionMatchesRoom(actor, { id: "yard-3", worldEpoch: "epoch-a", reserved: 1 }), true);
assert.equal(worldV0StoredSessionMatchesRoom(actor, { id: "yard-3", worldEpoch: "epoch-a", reserved: 0 }), false, "connected ActorSession must not be offered as resumable");
assert.equal(worldV0StoredSessionMatchesRoom(actor, { id: "yard-3", worldEpoch: "epoch-b", reserved: 1 }), false);
assert.equal(writeWorldV0ResumeIntent(actor, session), true);
assert.equal(takeWorldV0ResumeIntent({ runKey: "yard-3", playerId: "Wrong" }, session), null);
assert.equal(takeWorldV0ResumeIntent({ runKey: "yard-3", playerId: "Jozz" }, session), null, "resume intent is one-shot even on mismatch");
assert.equal(writeWorldV0ResumeIntent(actor, session), true);
assert.deepEqual(takeWorldV0ResumeIntent({ runKey: "yard-3", playerId: "Jozz" }, session), { ...actor, savedAt: null });
assert.equal(clearWorldV0StoredSession("yard-3", "wrong-epoch", local), false);
assert.notEqual(readWorldV0StoredSession("yard-3", local), null);
assert.equal(clearWorldV0StoredSession("yard-3", "epoch-a", local), true);
assert.equal(readWorldV0StoredSession("yard-3", local), null);

const rooms = normalizeWorldV0PublicRoomDirectory({
  revision: WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION,
  rooms: [
    { id: "yard-1", name: "Yard 1", occupancy: 0, connected: 0, reserved: 0, capacity: 2, state: "empty", joinable: true, worldEpoch: null },
    { id: "yard-2", name: "Yard 2", occupancy: 2, connected: 2, reserved: 0, capacity: 2, state: "live", joinable: false, worldEpoch: "epoch-2" },
    { id: "yard-3", name: "Yard 3", occupancy: 2, connected: 1, reserved: 1, capacity: 2, state: "live-reserved", joinable: false, worldEpoch: "epoch-a" },
  ],
});
assert.deepEqual(rooms.map((room) => [room.id, room.connected, room.reserved]), [
  ["yard-1", 0, 0],
  ["yard-2", 2, 0],
  ["yard-3", 1, 1],
]);
assert.deepEqual(worldV0PublicRoomPresentation(rooms[2]), {
  status: "1/2 online · 1 reserved",
  action: "In session",
  joinable: false,
  tone: "reserved",
});
assert.deepEqual(worldV0PublicRoomPresentation(rooms[2], { resumable: true }), {
  status: "1/2 online · your place reserved",
  action: "Resume",
  joinable: true,
  tone: "resume",
});

console.log("WORLD_V0_SESSION_CONTINUITY_SMOKE_PASS");
