export const WORLD_V0_SESSION_CONTINUITY_REVISION = "world-v0-session-continuity-r1";

const SESSION_STORE_KEY = "shared-yard-v0-actor-sessions-v1";
const RESUME_INTENT_KEY = "shared-yard-v0-resume-intent-v1";
const RUN_KEY_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;

function usableStorage(storage) {
  return storage && typeof storage.getItem === "function" && typeof storage.setItem === "function" && typeof storage.removeItem === "function";
}

function validToken(value, max = 512) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function normalizeRecord(value) {
  if (!value || typeof value !== "object") return null;
  const record = value;
  if (!RUN_KEY_PATTERN.test(String(record.runKey || ""))) return null;
  if (!PLAYER_ID_PATTERN.test(String(record.playerId || ""))) return null;
  if (!validToken(record.worldEpoch) || !validToken(record.sessionId) || !validToken(record.resumeToken) || !validToken(record.netEntityId)) return null;
  const slot = Number(record.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot > 1) return null;
  return {
    revision: WORLD_V0_SESSION_CONTINUITY_REVISION,
    runKey: String(record.runKey),
    playerId: String(record.playerId),
    worldEpoch: String(record.worldEpoch),
    sessionId: String(record.sessionId),
    resumeToken: String(record.resumeToken),
    netEntityId: String(record.netEntityId),
    slot,
    savedAt: typeof record.savedAt === "string" ? record.savedAt : null,
  };
}

function readStore(storage) {
  if (!usableStorage(storage)) return {};
  try {
    const raw = storage.getItem(SESSION_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.revision !== WORLD_V0_SESSION_CONTINUITY_REVISION || typeof parsed.sessions !== "object" || parsed.sessions === null) return {};
    const sessions = {};
    for (const [runKey, value] of Object.entries(parsed.sessions)) {
      const record = normalizeRecord(value);
      if (record && record.runKey === runKey) sessions[runKey] = record;
    }
    return sessions;
  } catch {
    return {};
  }
}

function writeStore(sessions, storage) {
  if (!usableStorage(storage)) return false;
  try {
    storage.setItem(SESSION_STORE_KEY, JSON.stringify({
      revision: WORLD_V0_SESSION_CONTINUITY_REVISION,
      sessions,
    }));
    return true;
  } catch {
    return false;
  }
}

export function readWorldV0StoredSession(runKey, storage = globalThis.localStorage) {
  const safeRun = String(runKey || "").trim();
  if (!RUN_KEY_PATTERN.test(safeRun)) return null;
  return readStore(storage)[safeRun] ?? null;
}

export function writeWorldV0StoredSession(record, storage = globalThis.localStorage) {
  const normalized = normalizeRecord({ ...record, savedAt: record?.savedAt || new Date().toISOString() });
  if (!normalized) return false;
  const sessions = readStore(storage);
  sessions[normalized.runKey] = normalized;
  return writeStore(sessions, storage);
}

export function clearWorldV0StoredSession(runKey, worldEpoch = null, storage = globalThis.localStorage) {
  const safeRun = String(runKey || "").trim();
  if (!RUN_KEY_PATTERN.test(safeRun)) return false;
  const sessions = readStore(storage);
  const current = sessions[safeRun];
  if (!current) return false;
  if (worldEpoch && current.worldEpoch !== worldEpoch) return false;
  delete sessions[safeRun];
  return writeStore(sessions, storage);
}

export function worldV0StoredSessionMatchesRoom(session, room) {
  return Boolean(
    session && room &&
    session.runKey === room.id &&
    typeof room.worldEpoch === "string" && room.worldEpoch.length > 0 &&
    session.worldEpoch === room.worldEpoch
  );
}

export function writeWorldV0ResumeIntent(session, storage = globalThis.sessionStorage) {
  const normalized = normalizeRecord(session);
  if (!normalized || !usableStorage(storage)) return false;
  try {
    storage.setItem(RESUME_INTENT_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function takeWorldV0ResumeIntent({ runKey, playerId }, storage = globalThis.sessionStorage) {
  if (!usableStorage(storage)) return null;
  let raw = null;
  try {
    raw = storage.getItem(RESUME_INTENT_KEY);
    storage.removeItem(RESUME_INTENT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const record = normalizeRecord(JSON.parse(raw));
    if (!record) return null;
    if (record.runKey !== String(runKey || "").trim()) return null;
    if (record.playerId !== String(playerId || "").trim()) return null;
    return record;
  } catch {
    return null;
  }
}
