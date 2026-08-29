const roomInput = document.querySelector("#room");
const playerInput = document.querySelector("#player");
const stateEl = document.querySelector("#connection-state");
const countEl = document.querySelector("#participant-count");
const participantsEl = document.querySelector("#participants");
const sessionEl = document.querySelector("#session-id");
const connectButton = document.querySelector("#connect");
const disconnectButton = document.querySelector("#disconnect");
const reconnectButton = document.querySelector("#reconnect");
const signalInput = document.querySelector("#signal-text");
const signalButton = document.querySelector("#send-signal");
const logEl = document.querySelector("#log");

const inputs = [roomInput, playerInput, signalInput];
const buttons = [connectButton, disconnectButton, reconnectButton, signalButton];
if (inputs.some((element) => !(element instanceof HTMLInputElement)) || buttons.some((element) => !(element instanceof HTMLButtonElement)) || !(stateEl instanceof HTMLElement) || !(countEl instanceof HTMLElement) || !(participantsEl instanceof HTMLElement) || !(sessionEl instanceof HTMLElement) || !(logEl instanceof HTMLElement)) {
  throw new Error("Gate 3 UI is missing required elements.");
}

const params = new URLSearchParams(window.location.search);
roomInput.value = params.get("room") || "TEST";
playerInput.value = params.get("player") || `P-${crypto.randomUUID().slice(0, 6)}`;

let socket = null;
let currentSessionId = null;
let previousSessionId = null;
let reconnectAfterClose = false;

function appendLog(message) {
  const timestamp = new Date().toISOString().slice(11, 23);
  logEl.textContent = `${timestamp}  ${message}\n${logEl.textContent}`.trim();
}

function setState(value) {
  stateEl.textContent = value;
}

function isOpen() {
  return socket?.readyState === WebSocket.OPEN;
}

function updateControls() {
  const connecting = socket?.readyState === WebSocket.CONNECTING;
  const open = isOpen();
  roomInput.disabled = open || connecting || reconnectAfterClose;
  playerInput.disabled = open || connecting || reconnectAfterClose;
  connectButton.disabled = open || connecting || reconnectAfterClose;
  disconnectButton.disabled = !open;
  reconnectButton.disabled = !open;
  signalButton.disabled = !open;
}

function normalizeRoom() {
  return roomInput.value.trim().toUpperCase();
}

function websocketUrl() {
  const room = normalizeRoom();
  const player = playerInput.value.trim();
  const url = new URL(`/room/${encodeURIComponent(room)}/ws`, window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("player", player);
  return url.toString();
}

function updateShareQuery() {
  const url = new URL(window.location.href);
  url.searchParams.set("room", normalizeRoom());
  url.searchParams.delete("player");
  window.history.replaceState(null, "", url);
}

function connect(purpose = "manual") {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  updateShareQuery();
  setState(purpose === "recovery" ? "reconnecting" : "connecting");
  appendLog(`Opening room=${normalizeRoom()} player=${playerInput.value.trim()} (${purpose}).`);

  socket = new WebSocket(websocketUrl());
  updateControls();

  socket.addEventListener("open", () => {
    setState(purpose === "recovery" ? "reconnected; awaiting room hello" : "open; awaiting room hello");
    updateControls();
    appendLog("WebSocket open; waiting for Durable Object hello.");
  });

  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      appendLog("Ignored non-text frame.");
      return;
    }

    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      appendLog(`Received non-JSON text: ${event.data}`);
      return;
    }

    if (message.type === "hello" && typeof message.sessionId === "string") {
      previousSessionId = currentSessionId;
      currentSessionId = message.sessionId;
      sessionEl.textContent = currentSessionId;
      setState(purpose === "recovery" ? "recovered" : "joined");
      appendLog(`Joined room ${message.roomId} as ${message.playerId}; session ${currentSessionId.slice(0, 8)}…`);
      if (purpose === "recovery") {
        appendLog(previousSessionId && previousSessionId !== currentSessionId ? "Reconnect created a fresh room session." : "Reconnect completed; session identity was not comparable.");
      }
      return;
    }

    if (message.type === "presence" && Array.isArray(message.participants)) {
      countEl.textContent = String(message.count);
      participantsEl.textContent = message.participants.length ? message.participants.join(", ") : "—";
      appendLog(`Presence room=${message.roomId}: ${message.count} [${message.participants.join(", ")}].`);
      return;
    }

    if (message.type === "signal") {
      appendLog(`SIGNAL room=${message.roomId} from=${message.from}: ${message.text}`);
      return;
    }

    if (message.type === "pong") {
      appendLog(`Room pong ${message.id}.`);
      return;
    }

    appendLog(`Received ${event.data}`);
  });

  socket.addEventListener("close", (event) => {
    appendLog(`Closed: code=${event.code}, clean=${event.wasClean}, reason=${event.reason || "(none)"}.`);
    countEl.textContent = "0";
    participantsEl.textContent = "—";

    if (reconnectAfterClose) {
      reconnectAfterClose = false;
      setState("reconnecting");
      window.setTimeout(() => connect("recovery"), 500);
    } else {
      setState("closed");
    }
    updateControls();
  });

  socket.addEventListener("error", () => {
    appendLog("WebSocket error event.");
  });
}

connectButton.addEventListener("click", () => connect("manual"));

disconnectButton.addEventListener("click", () => {
  if (!isOpen()) return;
  setState("disconnecting");
  socket.close(4001, "gate-3-manual-disconnect");
  updateControls();
});

reconnectButton.addEventListener("click", () => {
  if (!isOpen()) return;
  reconnectAfterClose = true;
  setState("closing for reconnect");
  appendLog("Requesting controlled room reconnect.");
  socket.close(4002, "gate-3-reconnect-test");
  updateControls();
});

signalButton.addEventListener("click", () => {
  if (!isOpen()) return;
  const text = signalInput.value.trim();
  if (!text) return;

  const id = crypto.randomUUID();
  socket.send(JSON.stringify({ type: "signal", id, text }));
  appendLog(`Sent signal ${id.slice(0, 8)}…`);
});

updateControls();
appendLog("Gate 3 ready. Use the same room ID on two clients.");
