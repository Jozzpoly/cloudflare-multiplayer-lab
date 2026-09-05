import {
  WORLD_V0_FRIEND_ENTRY_REVISION,
  friendEntryCopy,
  friendEntryMode,
  generateWorldV0RoomKey,
  shouldReplaceLegacyStoredRoom,
  validWorldV0RoomKey,
} from "./friend-entry.js";

const bootstrapUrl = new URL(location.href);
const rawInviteRun = bootstrapUrl.searchParams.get("run");
const entryMode = friendEntryMode(rawInviteRun);
const storedRoom = localStorage.getItem("shared-yard-v0-run") || "";

// The qualified v7 app still contains its historical Math.random fallback.
// Friend-Ready prevents that fallback from becoming room identity by seeding a
// Web-Crypto key before importing the unchanged qualified runtime. Explicit
// invite URLs always win and remain backward-compatible.
if (entryMode === "host" && shouldReplaceLegacyStoredRoom(storedRoom)) {
  localStorage.setItem("shared-yard-v0-run", generateWorldV0RoomKey());
}

await import("./solo-inspection.js");

const boot = document.querySelector("#boot");
const bootTitle = boot?.querySelector("h1");
const bootStatus = document.querySelector("#boot-status");
const callsignInput = document.querySelector("#callsign");
const runInput = document.querySelector("#run");
const enterButton = document.querySelector("#enter");
const entryAdvanced = document.querySelector("#entry-advanced");
const copyInviteButton = document.querySelector("#copy-invite");
const inspectButton = document.querySelector("#inspect-solo");

if (!boot || !bootTitle || !bootStatus || !callsignInput || !runInput || !enterButton || !entryAdvanced || !copyInviteButton || !inspectButton) {
  throw new Error("Friend-Ready V1 entry shell incomplete");
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

function friendlyStatus(text) {
  const value = String(text || "");
  if (value.includes("same Run key")) return "Waiting for friend · send Invite friend";
  if (value.startsWith("Ready · share the same Run key")) return entryCopy.status;
  if (value === "waiting for peer") return "Waiting for friend";
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
  return {
    revision: WORLD_V0_FRIEND_ENTRY_REVISION,
    mode: entryMode,
    invited: entryMode === "invite",
    roomKeyValid: validWorldV0RoomKey(roomKey),
    roomKey,
    advancedOpen: Boolean(entryAdvanced.open),
    enterLabel: enterButton.textContent,
    inviteLabel: copyInviteButton.textContent,
    inspectInAdvanced: entryAdvanced.contains(inspectButton),
  };
}

window.__sharedYardV0FriendEntry = entrySnapshot;
window.__sharedYardV0Evidence = () => ({ ...baseEvidence(), friendEntry: entrySnapshot() });
window.__sharedYardV0Session = () => ({ ...baseSession(), friendEntry: entrySnapshot() });
