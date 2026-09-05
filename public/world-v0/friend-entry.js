export const WORLD_V0_FRIEND_ENTRY_REVISION = "shared-yard-v0-friend-entry-v1";
export const WORLD_V0_ROOM_KEY_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;

const ROOM_PREFIX = "yard-";
const ROOM_RANDOM_BYTES = 10;
const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LEGACY_RANDOM_ROOM_PATTERN = /^yard-[a-z0-9]{6}$/;

export function base64UrlFromBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error("room entropy must be Uint8Array");
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      output += BASE64URL[(buffer >>> bits) & 63];
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits > 0) output += BASE64URL[(buffer << (6 - bits)) & 63];
  return output;
}

export function roomKeyFromBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== ROOM_RANDOM_BYTES) {
    throw new Error(`room key requires exactly ${ROOM_RANDOM_BYTES} random bytes`);
  }
  const key = `${ROOM_PREFIX}${base64UrlFromBytes(bytes)}`;
  if (!WORLD_V0_ROOM_KEY_PATTERN.test(key)) throw new Error(`generated room key violates server contract: ${key}`);
  return key;
}

export function generateWorldV0RoomKey(cryptoLike = globalThis.crypto) {
  if (!cryptoLike || typeof cryptoLike.getRandomValues !== "function") {
    throw new Error("Web Crypto getRandomValues unavailable for room identity");
  }
  const bytes = new Uint8Array(ROOM_RANDOM_BYTES);
  cryptoLike.getRandomValues(bytes);
  return roomKeyFromBytes(bytes);
}

export function validWorldV0RoomKey(value) {
  return typeof value === "string" && WORLD_V0_ROOM_KEY_PATTERN.test(value.trim());
}

export function shouldReplaceLegacyStoredRoom(value) {
  if (!validWorldV0RoomKey(value)) return true;
  return LEGACY_RANDOM_ROOM_PATTERN.test(value.trim());
}

export function friendEntryMode(rawUrlRun) {
  if (rawUrlRun === null || rawUrlRun === undefined) return "host";
  return validWorldV0RoomKey(rawUrlRun) ? "invite" : "invalid-invite";
}

export function friendEntryCopy(mode) {
  if (mode === "invite") {
    return {
      title: "Join your friend",
      status: "Enter your name to join this shared world.",
      enterLabel: "Join world",
    };
  }
  if (mode === "invalid-invite") {
    return {
      title: "Invite link problem",
      status: "This invite has an invalid room ID. Ask your friend for a fresh link.",
      enterLabel: "Join unavailable",
    };
  }
  return {
    title: "Enter Multi_World",
    status: "Enter your name. Invite a friend after you join.",
    enterLabel: "Enter world",
  };
}
