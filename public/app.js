const stateEl = document.querySelector("#connection-state");
const connectionIdEl = document.querySelector("#connection-id");
const rttEl = document.querySelector("#rtt");
const connectButton = document.querySelector("#connect");
const roundTripButton = document.querySelector("#round-trip");
const reconnectButton = document.querySelector("#reconnect");
const logEl = document.querySelector("#log");

const requiredElements = [
  stateEl,
  connectionIdEl,
  rttEl,
  connectButton,
  roundTripButton,
  reconnectButton,
  logEl,
];

if (requiredElements.some((element) => !(element instanceof HTMLElement))) {
  throw new Error("Gate 2 UI is missing required elements.");
}

if (!(connectButton instanceof HTMLButtonElement) || !(roundTripButton instanceof HTMLButtonElement) || !(reconnectButton instanceof HTMLButtonElement)) {
  throw new Error("Gate 2 controls are not buttons.");
}

let socket = null;
let connectionId = null;
let previousConnectionId = null;
let pendingProbe = null;
let connectPurpose = "manual";
let reconnectAfterClose = false;

function appendLog(message) {
  const timestamp = new Date().toISOString().slice(11, 23);
  logEl.textContent = `${timestamp}  ${message}\n${logEl.textContent}`.trim();
}

function setState(label) {
  stateEl.textContent = label;
}

function setControls(isOpen) {
  connectButton.disabled = isOpen || socket?.readyState === WebSocket.CONNECTING || reconnectAfterClose;
  roundTripButton.disabled = !isOpen;
  reconnectButton.disabled = !isOpen;
}

function websocketUrl() {
  const url = new URL("/ws", window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function sendProbe(kind = "manual") {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    appendLog("Probe skipped: socket is not open.");
    return;
  }

  const id = crypto.randomUUID();
  pendingProbe = {
    id,
    kind,
    startedAt: performance.now(),
  };

  socket.send(JSON.stringify({
    type: "ping",
    id,
    clientSentAt: Date.now(),
  }));

  appendLog(`Sent ${kind} ping ${id.slice(0, 8)}…`);
}

function connect(purpose = "manual") {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  connectPurpose = purpose;
  setState(purpose === "recovery" ? "reconnecting" : "connecting");
  appendLog(`Opening ${websocketUrl()} (${purpose}).`);

  socket = new WebSocket(websocketUrl());
  setControls(false);

  socket.addEventListener("open", () => {
    setState(purpose === "recovery" ? "reconnected; verifying" : "open");
    setControls(true);
    appendLog("WebSocket open.");
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

    if (message.type === "hello" && typeof message.connectionId === "string") {
      previousConnectionId = connectionId;
      connectionId = message.connectionId;
      connectionIdEl.textContent = connectionId;
      appendLog(`Server hello: connection ${connectionId.slice(0, 8)}…`);

      if (connectPurpose === "recovery") {
        const changed = previousConnectionId !== null && previousConnectionId !== connectionId;
        appendLog(changed ? "Reconnect created a new server connection." : "Reconnect opened; connection identity could not be compared.");
        sendProbe("recovery");
      }
      return;
    }

    if (message.type === "pong" && pendingProbe && message.id === pendingProbe.id) {
      const rtt = performance.now() - pendingProbe.startedAt;
      rttEl.textContent = `${rtt.toFixed(1)} ms`;
      appendLog(`Received ${pendingProbe.kind} pong in ${rtt.toFixed(1)} ms.`);

      if (pendingProbe.kind === "recovery") {
        setState("recovered");
        connectPurpose = "manual";
        appendLog("Gate 2 recovery path passed: reconnect + round-trip.");
      }

      pendingProbe = null;
      return;
    }

    appendLog(`Received ${event.data}`);
  });

  socket.addEventListener("close", (event) => {
    setControls(false);
    pendingProbe = null;
    appendLog(`WebSocket closed: code=${event.code}, clean=${event.wasClean}, reason=${event.reason || "(none)"}.`);

    if (reconnectAfterClose) {
      reconnectAfterClose = false;
      setState("reconnecting");
      window.setTimeout(() => connect("recovery"), 500);
      return;
    }

    if (connectPurpose === "recovery") {
      setState("recovery failed");
      connectPurpose = "manual";
      setControls(false);
      return;
    }

    setState("closed");
  });

  socket.addEventListener("error", () => {
    appendLog("WebSocket error event.");
  });
}

connectButton.addEventListener("click", () => {
  connect("manual");
});

roundTripButton.addEventListener("click", () => {
  sendProbe("manual");
});

reconnectButton.addEventListener("click", () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  reconnectAfterClose = true;
  setState("closing for reconnect");
  setControls(false);
  appendLog("Requesting controlled client close before one reconnect attempt.");
  socket.close(4000, "gate-2-reconnect-test");
});

setControls(false);
appendLog("Gate 2 ready. Connect explicitly to begin.");
