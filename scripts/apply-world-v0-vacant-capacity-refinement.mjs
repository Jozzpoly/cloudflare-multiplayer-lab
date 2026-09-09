import { readFileSync, writeFileSync } from "node:fs";

function replaceExact(path, from, to, label) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label}: expected source fragment missing in ${path}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label}: expected source fragment is not unique in ${path}`);
  writeFileSync(path, source.slice(0, first) + to + source.slice(first + from.length));
}

function replaceRegexOnce(path, pattern, to, label) {
  const source = readFileSync(path, "utf8");
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one match in ${path}, got ${matches.length}`);
  writeFileSync(path, source.replace(pattern, to));
}

replaceExact(
  "src/world-v0-shared-yard.ts",
  `if ((this.protocolStartTick !== null || this.loopTimer) && this.softReservedPlayers().length > 0 && this.protectedReservedPlayers().length === 0) {
        this.endEpoch("peer_left_restart_required");
      }`,
  `const activeEpoch = this.protocolStartTick !== null || Boolean(this.loopTimer);
      const fullyVacantActiveEpoch = activeEpoch && this.players.size > 0 && this.connectedPlayerCount() === 0;
      const softOnlyReplacement = activeEpoch && this.softReservedPlayers().length > 0 && this.protectedReservedPlayers().length === 0;
      if (fullyVacantActiveEpoch) {
        // Private ActorSession resume authority may survive while the epoch is unused,
        // but zero connected humans never own scarce public room capacity. The first
        // authority-valid request wins: a Resume request is handled above, while a
        // fresh request retires the fully dormant epoch before creating a new one.
        this.endEpoch("all_players_disconnected_replaced");
      } else if (softOnlyReplacement) {
        this.endEpoch("peer_left_restart_required");
      }`,
  "authority vacant demand handoff",
);

replaceExact(
  "src/world-slice-entry.ts",
  `const protectedReserved = protectedReservedSlots.length;
      const softReserved = softReservedSlots.length;
      const active = status.protocolStartTick !== null && status.protocolStartTick !== undefined;
      const replacementCapable = active && softReserved > 0 && protectedReserved === 0 && connected < WORLD_V0_PUBLIC_ROOM_CAPACITY;
      const state = active
        ? protectedReserved > 0
          ? "live-protected-reserved"
          : softReserved > 0
            ? "live-soft-reserved"
            : "live"
        : occupancy > 0
          ? reserved > 0 ? "waiting-reserved" : "waiting"
          : "empty";`,
  `const protectedReserved = protectedReservedSlots.length;
      const softReserved = softReservedSlots.length;
      const active = status.protocolStartTick !== null && status.protocolStartTick !== undefined;
      const fullyVacantResumable = active && connected === 0 && reserved > 0;
      const replacementCapable = active && connected < WORLD_V0_PUBLIC_ROOM_CAPACITY && (
        fullyVacantResumable || (softReserved > 0 && protectedReserved === 0)
      );
      const state = active
        ? fullyVacantResumable
          ? "live-vacant-resumable"
          : protectedReserved > 0
            ? "live-protected-reserved"
            : softReserved > 0
              ? "live-soft-reserved"
              : "live"
        : occupancy > 0
          ? reserved > 0 ? "waiting-reserved" : "waiting"
          : "empty";`,
  "directory vacant capacity classification",
);

replaceExact(
  "src/world-slice-entry.ts",
  `revision: "world-v0-public-room-directory-r3-soft-reservation",`,
  `revision: "world-v0-public-room-directory-r4-vacant-capacity",`,
  "directory revision",
);

replaceExact(
  "public/world-v0/public-room-entry.js",
  `export const WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION = "world-v0-public-room-entry-r2-soft-reservation";
export const WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION = "world-v0-public-room-directory-r3-soft-reservation";`,
  `export const WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION = "world-v0-public-room-entry-r3-presence-capacity";
export const WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION = "world-v0-public-room-directory-r4-vacant-capacity";`,
  "public room revisions",
);

const presentation = String.raw`export function worldV0LocalSessionPresence(room, session) {
  if (!room || !session || room.worldEpoch !== session.worldEpoch || room.id !== session.runKey) return "none";
  if (!Number.isInteger(session.slot) || !Array.isArray(room.reservedSlots)) return "unknown";
  return room.reservedSlots.includes(session.slot) ? "resumable" : "active";
}

export function worldV0PublicRoomPresentation(room, { resumable = false, session = null } = {}) {
  if (!room || room.occupancy === null || room.state === "unavailable") {
    return { status: "Unavailable", action: "Unavailable", joinable: false, tone: "unavailable" };
  }
  const occupancy = `${room.occupancy}/${room.capacity}`;
  const connected = Number.isInteger(room.connected) ? room.connected : room.occupancy;
  const protectedReserved = Number.isInteger(room.protectedReserved) ? room.protectedReserved : 0;
  const softReserved = Number.isInteger(room.softReserved) ? room.softReserved : 0;
  const localPresence = session ? worldV0LocalSessionPresence(room, session) : (resumable ? "resumable" : "none");
  if (localPresence === "active") {
    return {
      status: `${connected}/${room.capacity} online · your session is active`,
      action: "Take over",
      joinable: true,
      tone: "resume",
    };
  }
  if (localPresence === "resumable" || localPresence === "unknown") {
    return {
      status: connected === 0 && room.replacementCapable
        ? `${connected}/${room.capacity} online · your session can resume`
        : protectedReserved > 0
          ? `${connected}/${room.capacity} online · your place protected`
          : softReserved > 0
            ? `${connected}/${room.capacity} online · your session can resume`
            : `${occupancy} · Your session`,
      action: "Resume",
      joinable: true,
      tone: "resume",
    };
  }
  if (connected === 0 && room.reserved > 0 && room.replacementCapable) {
    return {
      status: `${connected}/${room.capacity} online · room available`,
      action: "Enter",
      joinable: true,
      tone: "soft",
    };
  }
  if (protectedReserved > 0) {
    return {
      status: `${connected}/${room.capacity} online · ${protectedReserved} protected`,
      action: room.state.startsWith("live") ? "In session" : "Reserved",
      joinable: false,
      tone: "reserved",
    };
  }
  if (softReserved > 0) {
    return room.joinable
      ? {
          status: `${connected}/${room.capacity} online · ${softReserved} open seat`,
          action: "Join",
          joinable: true,
          tone: "soft",
        }
      : {
          status: `${connected}/${room.capacity} online · ${softReserved} reserved`,
          action: "In session",
          joinable: false,
          tone: "reserved",
        };
  }
  if (!room.joinable) {
    return {
      status: `${occupancy} · ${room.state === "live" ? "Live" : "Full"}`,
      action: room.state === "live" ? "In session" : "Full",
      joinable: false,
      tone: "full",
    };
  }
  if (room.occupancy === 0) {
    return { status: `${occupancy} · Empty`, action: "Enter", joinable: true, tone: "empty" };
  }
  return { status: `${occupancy} · Waiting`, action: "Join", joinable: true, tone: "waiting" };
}`;

replaceRegexOnce(
  "public/world-v0/public-room-entry.js",
  /export function worldV0PublicRoomPresentation\(room, \{ resumable = false \} = \{\}\) \{[\s\S]*\}\s*$/,
  presentation,
  "public room presentation",
);

replaceExact(
  "public/world-v0/friend-ready.js",
  `  worldV0PublicRoomPresentation,
} from "./public-room-entry.js";`,
  `  worldV0LocalSessionPresence,
  worldV0PublicRoomPresentation,
} from "./public-room-entry.js";`,
  "friend-ready presence import",
);

replaceExact(
  "public/world-v0/friend-ready.js",
  `function resumableSessionForRoom(room) {
  const stored = readWorldV0StoredSession(room?.id);
  return worldV0StoredSessionMatchesRoom(stored, room) ? stored : null;
}`,
  `function resumableSessionForRoom(room) {
  const stored = readWorldV0StoredSession(room?.id);
  return worldV0StoredSessionMatchesRoom(stored, room) ? stored : null;
}

function localSessionStateForRoom(room) {
  const session = resumableSessionForRoom(room);
  return session ? worldV0LocalSessionPresence(room, session) : "none";
}`,
  "friend-ready local presence helper",
);

replaceExact(
  "public/world-v0/friend-ready.js",
  `      reserved: room.reserved,
      reservedSlots: [...room.reservedSlots],
      capacity: room.capacity,
      state: room.state,
      joinable: room.joinable,
      resumableHere: Boolean(resumableSessionForRoom(room)),`,
  `      reserved: room.reserved,
      reservedSlots: [...room.reservedSlots],
      protectedReserved: room.protectedReserved,
      protectedReservedSlots: [...room.protectedReservedSlots],
      softReserved: room.softReserved,
      softReservedSlots: [...room.softReservedSlots],
      replacementCapable: room.replacementCapable,
      capacity: room.capacity,
      state: room.state,
      joinable: room.joinable,
      resumableHere: Boolean(resumableSessionForRoom(room)),
      localSessionState: localSessionStateForRoom(room),`,
  "friend-ready evidence presence",
);

replaceExact(
  "public/world-v0/friend-ready.js",
  `const presentation = worldV0PublicRoomPresentation(room, { resumable: Boolean(resumableSession) });`,
  `const presentation = worldV0PublicRoomPresentation(room, { resumable: Boolean(resumableSession), session: resumableSession });`,
  "friend-ready presentation session",
);

replaceExact(
  "scripts/world-v0-soft-reservation-authority-probe.mjs",
  `payload.revision === "world-v0-public-room-directory-r3-soft-reservation"`,
  `payload.revision === "world-v0-public-room-directory-r4-vacant-capacity"`,
  "soft probe directory revision",
);

console.log("WORLD_V0_VACANT_CAPACITY_REFINEMENT_APPLIED");
