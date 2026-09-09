export const WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION = "world-v0-public-room-entry-r2-soft-reservation";
export const WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION = "world-v0-public-room-directory-r3-soft-reservation";
export const WORLD_V0_PUBLIC_ROOM_IDS = Object.freeze(["yard-1", "yard-2", "yard-3"]);

function normalizedSlotList(value, capacity, id, label) {
  if (!Array.isArray(value) || value.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= capacity)) {
    throw new Error(`public room ${label} invalid: ${id}`);
  }
  if (new Set(value).size !== value.length) throw new Error(`public room ${label} duplicate: ${id}`);
  return [...value].sort((a, b) => a - b);
}

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
    const protectedReserved = room.protectedReserved === null || room.protectedReserved === undefined ? null : Number(room.protectedReserved);
    const softReserved = room.softReserved === null || room.softReserved === undefined ? null : Number(room.softReserved);
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
    if (protectedReserved !== null && (!Number.isInteger(protectedReserved) || protectedReserved < 0 || protectedReserved > capacity)) {
      throw new Error(`public room protected reserved count invalid: ${id}`);
    }
    if (softReserved !== null && (!Number.isInteger(softReserved) || softReserved < 0 || softReserved > capacity)) {
      throw new Error(`public room soft reserved count invalid: ${id}`);
    }
    if (occupancy !== null && connected !== null && reserved !== null && connected + reserved !== occupancy) {
      throw new Error(`public room presence accounting invalid: ${id}`);
    }
    if (reserved !== null && protectedReserved !== null && softReserved !== null && protectedReserved + softReserved !== reserved) {
      throw new Error(`public room reservation classification invalid: ${id}`);
    }
    const reservedSlots = normalizedSlotList(room.reservedSlots, capacity, id, "reserved slots");
    const protectedReservedSlots = normalizedSlotList(room.protectedReservedSlots, capacity, id, "protected reserved slots");
    const softReservedSlots = normalizedSlotList(room.softReservedSlots, capacity, id, "soft reserved slots");
    if (reserved !== null && reservedSlots.length !== reserved) throw new Error(`public room reserved slot accounting invalid: ${id}`);
    if (protectedReserved !== null && protectedReservedSlots.length !== protectedReserved) throw new Error(`public room protected slot accounting invalid: ${id}`);
    if (softReserved !== null && softReservedSlots.length !== softReserved) throw new Error(`public room soft slot accounting invalid: ${id}`);
    const classifiedSlots = [...protectedReservedSlots, ...softReservedSlots].sort((a, b) => a - b);
    if (new Set(classifiedSlots).size !== classifiedSlots.length || classifiedSlots.length !== reservedSlots.length || classifiedSlots.some((slot, index) => slot !== reservedSlots[index])) {
      throw new Error(`public room reservation slot partition invalid: ${id}`);
    }
    return {
      id,
      name: room.name,
      occupancy,
      connected,
      reserved,
      reservedSlots,
      protectedReserved,
      protectedReservedSlots,
      softReserved,
      softReservedSlots,
      replacementCapable: room.replacementCapable === true,
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
  const connected = Number.isInteger(room.connected) ? room.connected : room.occupancy;
  const protectedReserved = Number.isInteger(room.protectedReserved) ? room.protectedReserved : 0;
  const softReserved = Number.isInteger(room.softReserved) ? room.softReserved : 0;
  if (resumable) {
    return {
      status: protectedReserved > 0
        ? `${connected}/${room.capacity} online · your place protected`
        : softReserved > 0
          ? `${connected}/${room.capacity} online · your session can resume`
          : `${occupancy} · Your session`,
      action: "Resume",
      joinable: true,
      tone: "resume",
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
}
