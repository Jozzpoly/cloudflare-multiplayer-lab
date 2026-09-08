import {
  WORLD_V0_FRIEND_ENTRY_REVISION,
  friendEntryCopy,
  friendEntryMode,
  generateWorldV0RoomKey,
  shouldReplaceLegacyStoredRoom,
  validWorldV0RoomKey,
} from "./friend-entry.js";
import {
  WORLD_V0_HUMAN_ENTRY_REVISION,
  normalizeWorldV0HumanName,
  worldV0HumanNameMessage,
} from "./human-entry-core.js";
import {
  WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION,
  WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION,
  WORLD_V0_PUBLIC_ROOM_IDS,
  normalizeWorldV0PublicRoomDirectory,
  worldV0PublicRoomPresentation,
} from "./public-room-entry.js";
import {
  WORLD_V0_SESSION_CONTINUITY_REVISION,
  clearWorldV0StoredSession,
  readWorldV0StoredSession,
  worldV0StoredSessionMatchesRoom,
  writeWorldV0ResumeIntent,
} from "./session-continuity.js";

const bootstrapUrl = new URL(location.href);
const rawInviteRun = bootstrapUrl.searchParams.get("run");
const entryMode = friendEntryMode(rawInviteRun);
const storedRoom = localStorage.getItem("shared-yard-v0-run") || "";

// Keep the qualified Friend-Ready random-room path as a compatibility/deep-link
// fallback. R0c no longer exposes it as the normal base-URL workflow: ordinary
// users choose from the shared Yard directory instead.
if (entryMode === "host" && shouldReplaceLegacyStoredRoom(storedRoom)) {
  localStorage.setItem("shared-yard-v0-run", generateWorldV0RoomKey());
}

await import("./solo-inspection.js");

const boot = document.querySelector("#boot");
const bootTitle = boot?.querySelector("h1");
const bootStatus = document.querySelector("#boot-status");
const callsignInput = document.querySelector("#callsign");
const callsignHelp = document.querySelector("#callsign-help");
const runInput = document.querySelector("#run");
const enterButton = document.querySelector("#enter");
const entryActions = document.querySelector("#boot .entry-actions");
const entryAdvanced = document.querySelector("#entry-advanced");
const copyInviteButton = document.querySelector("#copy-invite");
const inspectButton = document.querySelector("#inspect-solo");
const publicRoomEntry = document.querySelector("#public-room-entry");
const publicRoomList = document.querySelector("#public-room-list");
const publicRoomStatus = document.querySelector("#public-room-status");

if (!boot || !bootTitle || !bootStatus || !callsignInput || !callsignHelp || !runInput || !enterButton || !entryActions || !entryAdvanced || !copyInviteButton || !inspectButton || !publicRoomEntry || !publicRoomList || !publicRoomStatus) {
  throw new Error("Friend-Ready / Public Room R0c entry shell incomplete");
}

if (entryMode === "invite" && rawInviteRun) runInput.value = rawInviteRun.trim();

const entryCopy = friendEntryCopy(entryMode);
bootTitle.textContent = entryCopy.title;
bootStatus.textContent = entryCopy.status;
enterButton.textContent = entryCopy.enterLabel;
copyInviteButton.textContent = "Invite friend";

if (entryMode === "invalid-invite") {
  enterButton.disabled = true;
  entryAdvanced.open = true;
}

function humanNameSnapshot() {
  return normalizeWorldV0HumanName(callsignInput.value);
}

function renderHumanNameHelp(result = humanNameSnapshot(), committed = false) {
  callsignHelp.textContent = worldV0HumanNameMessage(result);
  callsignHelp.dataset.tone = !result.valid && result.source
    ? "invalid"
    : result.changed || committed
      ? "adjusted"
      : "normal";
  if (!result.valid && result.source) callsignInput.setAttribute("aria-invalid", "true");
  else callsignInput.removeAttribute("aria-invalid");
  return result;
}

renderHumanNameHelp();

callsignInput.addEventListener("input", () => renderHumanNameHelp());
callsignInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing || enterButton.disabled) return;
  event.preventDefault();
  enterButton.click();
});

let deepLinkResumeSession = null;

// app.js owns the actual Enter click handler and still sends the original strict
// server-side playerId contract. This capture-phase adapter runs first so normal
// human names do not bounce off a hidden wire-identity regex, and so a qualified
// direct-link resume can arm the private ActorSession token before app.js connects.
enterButton.addEventListener("click", (event) => {
  if (deepLinkResumeSession) {
    callsignInput.value = deepLinkResumeSession.playerId;
    if (!writeWorldV0ResumeIntent(deepLinkResumeSession)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      bootStatus.textContent = "Could not prepare your reserved Yard session";
      return;
    }
  }
  const result = humanNameSnapshot();
  if (!result.valid) {
    event.preventDefault();
    event.stopImmediatePropagation();
    callsignInput.setAttribute("aria-invalid", "true");
    callsignHelp.dataset.tone = "invalid";
    callsignHelp.textContent = worldV0HumanNameMessage(result);
    callsignInput.focus();
    return;
  }
  if (result.changed) {
    callsignInput.value = result.wireName;
    renderHumanNameHelp({ ...result, source: result.wireName, changed: false }, true);
  }
}, { capture: true });

const publicRoomState = {
  loading: entryMode === "host",
  error: null,
  rooms: [],
  selectedRoom: null,
  polls: 0,
  lastUpdatedAt: null,
};
let directoryTimer = null;
let directoryRequest = null;

function isCanonicalPublicYard(value) {
  return WORLD_V0_PUBLIC_ROOM_IDS.includes(String(value || "").trim());
}

function resumableSessionForRoom(room) {
  const stored = readWorldV0StoredSession(room?.id);
  return worldV0StoredSessionMatchesRoom(stored, room) ? stored : null;
}

function publicRoomSnapshot() {
  return {
    revision: WORLD_V0_PUBLIC_ROOM_ENTRY_REVISION,
    directoryRevision: WORLD_V0_PUBLIC_ROOM_DIRECTORY_REVISION,
    sessionContinuityRevision: WORLD_V0_SESSION_CONTINUITY_REVISION,
    mode: entryMode === "host" ? "directory" : "deep-link",
    visible: !publicRoomEntry.classList.contains("hidden"),
    loading: publicRoomState.loading,
    error: publicRoomState.error,
    selectedRoom: publicRoomState.selectedRoom,
    polls: publicRoomState.polls,
    lastUpdatedAt: publicRoomState.lastUpdatedAt,
    deepLinkResumable: Boolean(deepLinkResumeSession),
    rooms: publicRoomState.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      occupancy: room.occupancy,
      connected: room.connected,
      reserved: room.reserved,
      reservedSlots: [...room.reservedSlots],
      capacity: room.capacity,
      state: room.state,
      joinable: room.joinable,
      resumableHere: Boolean(resumableSessionForRoom(room)),
    })),
    advancedFallbackAvailable: entryAdvanced.contains(runInput) && entryAdvanced.contains(inspectButton),
  };
}

function renderPublicRooms() {
  if (entryMode !== "host") return;
  publicRoomList.replaceChildren();
  for (const room of publicRoomState.rooms) {
    const resumableSession = resumableSessionForRoom(room);
    const presentation = worldV0PublicRoomPresentation(room, { resumable: Boolean(resumableSession) });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "public-room-card";
    button.dataset.roomId = room.id;
    button.dataset.tone = presentation.tone;
    button.disabled = !presentation.joinable || enterButton.disabled || boot.classList.contains("compact");
    button.setAttribute("aria-label", `${room.name}, ${presentation.status}, ${presentation.action}`);

    const name = document.createElement("span");
    name.className = "public-room-name";
    name.textContent = room.name;
    const state = document.createElement("span");
    state.className = "public-room-state";
    state.textContent = presentation.status;
    const action = document.createElement("span");
    action.className = "public-room-action";
    action.textContent = presentation.action;
    button.append(name, state, action);

    button.addEventListener("click", () => {
      if (button.disabled) return;
      if (resumableSession) {
        callsignInput.value = resumableSession.playerId;
        renderHumanNameHelp();
        if (!writeWorldV0ResumeIntent(resumableSession)) {
          publicRoomStatus.textContent = "Could not prepare session resume";
          return;
        }
      }
      publicRoomState.selectedRoom = room.id;
      runInput.value = room.id;
      renderPublicRooms();
      enterButton.click();
    });
    publicRoomList.append(button);
  }

  if (publicRoomState.error) publicRoomStatus.textContent = "Room list unavailable · retrying";
  else if (publicRoomState.loading) publicRoomStatus.textContent = "Loading rooms…";
  else publicRoomStatus.textContent = "Live connected / reserved presence";
}

async function fetchPublicRooms() {
  const response = await fetch("/api/world-v0/rooms", { cache: "no-store" });
  if (!response.ok) throw new Error(`directory HTTP ${response.status}`);
  return normalizeWorldV0PublicRoomDirectory(await response.json());
}

async function refreshPublicRooms() {
  if (entryMode !== "host" || boot.classList.contains("compact")) return;
  if (directoryRequest) return directoryRequest;
  directoryRequest = (async () => {
    publicRoomState.loading = publicRoomState.rooms.length === 0;
    try {
      publicRoomState.rooms = await fetchPublicRooms();
      publicRoomState.error = null;
      publicRoomState.polls += 1;
      publicRoomState.lastUpdatedAt = new Date().toISOString();
    } catch (error) {
      publicRoomState.error = error instanceof Error ? error.message : String(error);
    } finally {
      publicRoomState.loading = false;
      directoryRequest = null;
      renderPublicRooms();
    }
  })();
  return directoryRequest;
}

async function resolveDirectLinkResume() {
  if (entryMode !== "invite" || !isCanonicalPublicYard(rawInviteRun)) return null;
  const run = rawInviteRun.trim();
  const stored = readWorldV0StoredSession(run);
  if (!stored) return null;

  bootStatus.textContent = "Checking your previous Yard session…";
  enterButton.textContent = "Checking session…";
  for (let attempt = 0; attempt < 9; attempt += 1) {
    try {
      const rooms = await fetchPublicRooms();
      const room = rooms.find((candidate) => candidate.id === run);
      if (!room) break;
      if (room.worldEpoch !== stored.worldEpoch) {
        if (room.state !== "unavailable") clearWorldV0StoredSession(run, stored.worldEpoch);
        break;
      }
      const resumable = worldV0StoredSessionMatchesRoom(stored, room);
      if (resumable) {
        deepLinkResumeSession = stored;
        callsignInput.value = stored.playerId;
        renderHumanNameHelp();
        enterButton.textContent = "Resume world";
        bootStatus.textContent = `${room.name} kept your player · resume the same session`;
        return stored;
      }
      if (room.reserved === 0 && room.connected === room.occupancy) {
        // The previous page may still be disconnecting. Give the authority a short
        // bounded window to expose the seat as reserved before treating this as an
        // ordinary direct link. This does not rebind an ActorSession that is still live.
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  deepLinkResumeSession = null;
  enterButton.textContent = entryCopy.enterLabel;
  bootStatus.textContent = entryCopy.status;
  return null;
}

if (entryMode === "host") {
  publicRoomEntry.classList.remove("hidden");
  entryActions.classList.add("public-room-legacy-hidden");
  bootStatus.textContent = "Choose a shared Yard. Everyone sees the same rooms.";
  renderPublicRooms();
  await refreshPublicRooms();
  directoryTimer = setInterval(refreshPublicRooms, 1200);
} else {
  publicRoomEntry.classList.add("hidden");
  await resolveDirectLinkResume();
}

const enterAvailabilityObserver = new MutationObserver(() => renderPublicRooms());
enterAvailabilityObserver.observe(enterButton, { attributes: true, attributeFilter: ["disabled"] });

const bootClassObserver = new MutationObserver(() => {
  if (!boot.classList.contains("compact") || !directoryTimer) return;
  clearInterval(directoryTimer);
  directoryTimer = null;
});
bootClassObserver.observe(boot, { attributes: true, attributeFilter: ["class"] });

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshPublicRooms();
});

function friendlyStatus(text) {
  const value = String(text || "");
  const publicYard = publicRoomState.selectedRoom || (isCanonicalPublicYard(runInput.value) ? runInput.value.trim() : null);
  if (value.includes("same Run key")) {
    return publicYard ? "Waiting in this Yard · another player can join from the room list" : "Waiting for friend · send Invite friend";
  }
  if (value.startsWith("Ready · share the same Run key")) {
    return entryMode === "host" ? "Choose a shared Yard. Everyone sees the same rooms." : entryCopy.status;
  }
  if (value === "waiting for peer") return publicYard ? "Waiting in this Yard" : "Waiting for friend";
  return value;
}

const statusObserver = new MutationObserver(() => {
  const next = friendlyStatus(bootStatus.textContent);
  if (next !== bootStatus.textContent) bootStatus.textContent = next;
});
statusObserver.observe(bootStatus, { childList: true, characterData: true, subtree: true });

copyInviteButton.addEventListener("click", () => {
  setTimeout(() => {
    if (copyInviteButton.textContent === "Copy invite") copyInviteButton.textContent = "Invite friend";
  }, 1300);
});

const baseEvidence = window.__sharedYardV0Evidence;
const baseSession = window.__sharedYardV0Session;
if (typeof baseEvidence !== "function" || typeof baseSession !== "function") {
  throw new Error("Friend-Ready V1 requires initialized Shared Yard evidence/session helpers");
}

function entrySnapshot() {
  const roomKey = runInput.value.trim();
  const humanName = humanNameSnapshot();
  return {
    revision: WORLD_V0_FRIEND_ENTRY_REVISION,
    humanEntryRevision: WORLD_V0_HUMAN_ENTRY_REVISION,
    sessionContinuityRevision: WORLD_V0_SESSION_CONTINUITY_REVISION,
    mode: entryMode,
    invited: entryMode === "invite",
    roomKeyValid: validWorldV0RoomKey(roomKey),
    roomKey,
    directLinkResumable: Boolean(deepLinkResumeSession),
    humanName: {
      source: humanName.source,
      wireName: humanName.wireName,
      valid: humanName.valid,
      changed: humanName.changed,
    },
    advancedOpen: Boolean(entryAdvanced.open),
    enterLabel: enterButton.textContent,
    inviteLabel: copyInviteButton.textContent,
    inspectInAdvanced: entryAdvanced.contains(inspectButton),
  };
}

window.__sharedYardV0PublicRoomEntry = publicRoomSnapshot;
window.__sharedYardV0FriendEntry = entrySnapshot;
window.__sharedYardV0Evidence = () => ({ ...baseEvidence(), friendEntry: entrySnapshot(), publicRoomEntry: publicRoomSnapshot() });
window.__sharedYardV0Session = () => ({ ...baseSession(), friendEntry: entrySnapshot(), publicRoomEntry: publicRoomSnapshot() });
