import {
  WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION,
  WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION,
  worldV0LocalSessionPresence,
  worldV0PublicRoomPresentation,
} from "../public/world-v0/public-room-entry.js";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function room(overrides = {}) {
  return {
    id: "yard-1",
    name: "Yard 1",
    occupancy: 2,
    connected: 0,
    reserved: 2,
    reservedSlots: [0, 1],
    protectedReserved: 2,
    protectedReservedSlots: [0, 1],
    softReserved: 0,
    softReservedSlots: [],
    replacementCapable: true,
    capacity: 2,
    state: "live-vacant-resumable",
    joinable: true,
    joinPath: "/world-v0/?run=yard-1",
    worldEpoch: "epoch-a",
    failure: null,
    ...overrides,
  };
}

const session = {
  runKey: "yard-1",
  playerId: "Owner-A",
  worldEpoch: "epoch-a",
  sessionId: "session-a",
  resumeToken: "token-a",
  netEntityId: "actor:0",
  slot: 0,
};

assert(WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION === "world-v0-public-room-entry-r3-presence-capacity", `entry revision ${WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION}`);
assert(WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION === "world-v0-public-room-directory-r4-vacant-capacity", `directory revision ${WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION}`);

const vacant = room();
const outsiderVacant = worldV0PublicRoomPresentation(vacant);
assert(outsiderVacant.joinable === true, "fully vacant retained epoch blocked outsider");
assert(outsiderVacant.action === "Enter", `vacant outsider action ${outsiderVacant.action}`);
assert(outsiderVacant.tone === "soft", `vacant outsider tone ${outsiderVacant.tone}`);
assert(worldV0LocalSessionPresence(vacant, session) === "resumable", "reserved stored slot not classified resumable");
const ownerVacant = worldV0PublicRoomPresentation(vacant, { session });
assert(ownerVacant.joinable === true && ownerVacant.action === "Resume", `vacant owner presentation ${JSON.stringify(ownerVacant)}`);

const activeElsewhere = room({
  connected: 2,
  reserved: 0,
  reservedSlots: [],
  protectedReserved: 0,
  protectedReservedSlots: [],
  replacementCapable: false,
  state: "live",
  joinable: false,
});
assert(worldV0LocalSessionPresence(activeElsewhere, session) === "active", "connected stored slot not classified active");
const activeOwner = worldV0PublicRoomPresentation(activeElsewhere, { session });
assert(activeOwner.joinable === true, "same-owner active takeover disabled");
assert(activeOwner.action === "Take over", `active owner action ${activeOwner.action}`);

const oneConnectedProtected = room({
  connected: 1,
  reserved: 1,
  reservedSlots: [1],
  protectedReserved: 1,
  protectedReservedSlots: [1],
  replacementCapable: false,
  state: "live-protected-reserved",
  joinable: false,
});
const outsiderProtected = worldV0PublicRoomPresentation(oneConnectedProtected);
assert(outsiderProtected.joinable === false, "one-connected protected peer became replaceable");
assert(outsiderProtected.tone === "reserved", `protected outsider tone ${outsiderProtected.tone}`);

const protectedOwnerSession = { ...session, slot: 1, sessionId: "session-b", resumeToken: "token-b", netEntityId: "actor:1" };
assert(worldV0LocalSessionPresence(oneConnectedProtected, protectedOwnerSession) === "resumable", "protected owner not resumable");
const protectedOwner = worldV0PublicRoomPresentation(oneConnectedProtected, { session: protectedOwnerSession });
assert(protectedOwner.joinable === true && protectedOwner.action === "Resume", "protected private owner cannot resume");

console.log("WORLD_V0_PRESENCE_CAPACITY_PRESENTATION_PASS", JSON.stringify({
  entryRevision: WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION,
  directoryRevision: WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION,
  vacantOutsider: outsiderVacant,
  vacantOwner: ownerVacant,
  activeOwner,
  protectedOutsider: outsiderProtected,
}));
