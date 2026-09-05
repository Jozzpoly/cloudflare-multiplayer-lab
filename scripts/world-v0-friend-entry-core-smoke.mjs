import {
  WORLD_V0_FRIEND_ENTRY_REVISION,
  WORLD_V0_ROOM_KEY_PATTERN,
  friendEntryCopy,
  friendEntryMode,
  generateWorldV0RoomKey,
  roomKeyFromBytes,
  shouldReplaceLegacyStoredRoom,
  validWorldV0RoomKey,
} from "../public/world-v0/friend-entry.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const bytes = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
const deterministic = roomKeyFromBytes(bytes);
assert(deterministic.startsWith("yard-"), `room prefix ${deterministic}`);
assert(deterministic.length === 19, `80-bit room key must fit existing 20-char server contract: ${deterministic.length}`);
assert(WORLD_V0_ROOM_KEY_PATTERN.test(deterministic), `generated room key violates contract ${deterministic}`);
assert(roomKeyFromBytes(bytes) === deterministic, "room encoding must be deterministic for fixed entropy bytes");

let calls = 0;
const fakeCrypto = {
  getRandomValues(target) {
    calls += 1;
    target.set(bytes);
    return target;
  },
};
const generated = generateWorldV0RoomKey(fakeCrypto);
assert(calls === 1, `getRandomValues call count ${calls}`);
assert(generated === deterministic, `crypto-backed generation drift ${generated} != ${deterministic}`);

assert(validWorldV0RoomKey(generated), "strong generated key rejected");
assert(!validWorldV0RoomKey("bad room"), "invalid room key accepted");
assert(shouldReplaceLegacyStoredRoom("yard-abc123") === true, "legacy six-char random room should migrate on host entry");
assert(shouldReplaceLegacyStoredRoom(generated) === false, "strong room should remain stable");
assert(friendEntryMode(null) === "host", "base URL must be host mode");
assert(friendEntryMode(generated) === "invite", "valid URL room must be invite mode");
assert(friendEntryMode("bad room") === "invalid-invite", "invalid invite must fail visibly instead of silently creating another room");
assert(friendEntryCopy("host").enterLabel === "Enter world", "host entry copy drift");
assert(friendEntryCopy("invite").enterLabel === "Join world", "invite entry copy drift");
assert(friendEntryCopy("invalid-invite").enterLabel === "Join unavailable", "invalid invite copy drift");

console.log("WORLD_V0_FRIEND_ENTRY_CORE_PASS", JSON.stringify({
  revision: WORLD_V0_FRIEND_ENTRY_REVISION,
  deterministic,
  length: deterministic.length,
  randomBytes: bytes.length,
}));
