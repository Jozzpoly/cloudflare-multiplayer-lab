export const WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION = "world-v0-public-room-entry-r1-v3-live-rebind";
export const WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION = "world-v0-public-room-directory-r2-slot-presence";
export const WORLD_V0_PUBLIC_ROOM_IDS = Object.freeze(["yard-1", "yard-2", "yard-3"]);

export function normalizeWorldV0PublicRoomDirectory(payload) {
  if (!payload || payload.revision !== WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION || !Array.isArray(payload.rooms)) {
    throw new Error("public room directory contract mismatch");
  }
  const byId = new Map(payload.rooms.map((room) => [room?.id, room]));
  return WORLD_V0_PUBLIC_ROOM_IDS.map((id) => {
    const room = byId.get(id);
    if (!room || typeof room.name !== "string") throw new Error(`public room missing: ${id}`);
    const capacity = Number(room.capacity);
    const occupancy = room.occupancy === null ? null : Number(room.occupancy);
    const connected = room.connected === null || room.connected === undefined ? null : Number(room.connected);
    const reserved = room.reserved === null || room.reserved === undefined ? null : Number(room.reserved);
    const reservedSlots = Array.isArray(room.reservedSlots) ? [...room.reservedSlots] : null;
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error(`public room capacity invalid: ${id}`);
    if (occupancy !== null && (!Number.isInteger(occupancy) || occupancy < 0 || occupancy > capacity)) {
      throw new Error(`public room occupancy invalid: ${id}`);
    }
    if (connected !== null && (!Number.isInteger(connected) || connected < 0 || connected > capacity)) {
      throw new Error(`public room connected count invalid: ${id}`);
    }
    if (reserved !== null && (!Number.isInteger(reserved) || reserved < 0 || reserved > capacity)) {
      throw new Error(`public room reserved count invalid: ${id}`);
    }
    if (occupancy !== null && connected !== null && reserved !== null && connected + reserved !== occupancy) {
      throw new Error(`public room presence accounting invalid: ${id}`);
    }
    if (reservedSlots === null || reservedSlots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= capacity)) {
      throw new Error(`public room reserved slots invalid: ${id}`);
    }
    if (new Set(reservedSlots).size !== reservedSlots.length) throw new Error(`public room reserved slots duplicate: ${id}`);
    if (reserved !== null && reservedSlots.length !== reserved) throw new Error(`public room reserved slot accounting invalid: ${id}`);
    reservedSlots.sort((a, b) => a - b);
    return {
      id,
      name: room.name,
      occupancy,
      connected,
      reserved,
      reservedSlots,
      capacity,
      state: String(room.state || "unavailable"),
      joinable: room.joinable === true,
      joinPath: String(room.joinPath || `/world-v0/?run=${encodeURIComponent(id)}`),
      worldEpoch: room.worldEpoch ?? null,
      failure: room.failure ?? null,
    };
  });
}

export function worldV0PublicRoomPresentation(room, { resumable = false } = {}) {
  if (!room || room.occupancy === null || room.state === "unavailable") {
    return { status: "Unavailable", action: "Unavailable", joinable: false, tone: "unavailable" };
  }
  const occupancy = `${room.occupancy}/${room.capacity}`;
  const hasReserved = Number.isInteger(room.reserved) && room.reserved > 0;
  const connected = Number.isInteger(room.connected) ? room.connected : room.occupancy;
  if (resumable) {
    return {
      status: hasReserved
        ? `${connected}/${room.capacity} online · Your session`
        : `${occupancy} · Your session`,
      action: "Resume",
      joinable: true,
      tone: "resume",
    };
  }
  if (hasReserved) {
    return {
      status: `${connected}/${room.capacity} online · ${room.reserved} reserved`,
      action: room.state.startsWith("live") ? "In session" : "Reserved",
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
}
