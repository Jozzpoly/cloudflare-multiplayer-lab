import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(text, before, after, label) {
  const count = text.split(before).length - 1;
  if (count === 0 && text.includes(after)) return text;
  if (count !== 1) throw new Error(`session friction anchor ${label}: expected 1, found ${count}`);
  return text.replace(before, after);
}

const appPath = "public/world-v0/app.js";
let app = readFileSync(appPath, "utf8");

app = replaceOnce(app,
`const enterButton = document.querySelector("#enter");
const bootStatus = document.querySelector("#boot-status");
const notice = document.querySelector("#notice");
const joystick = document.querySelector("#joystick");
const joystickKnob = document.querySelector("#joystick-knob");
const copyEvidenceButton = document.querySelector("#copy-evidence");
const metricNames = ["net", "ticks", "guard", "corrections", "rewind", "replay", "rtt", "lease", "memory", "frame"];
const metric = Object.fromEntries(metricNames.map((name) => [name, document.querySelector(`#m-${name}`)]));
const required = [viewport, boot, bootTitle, callsignInput, runInput, enterButton, bootStatus, notice, joystick, joystickKnob, copyEvidenceButton, ...Object.values(metric)];`,
`const enterButton = document.querySelector("#enter");
const bootStatus = document.querySelector("#boot-status");
const sessionActions = document.querySelector("#session-actions");
const copyInviteButton = document.querySelector("#copy-invite");
const restartRoundButton = document.querySelector("#restart-round");
const notice = document.querySelector("#notice");
const joystick = document.querySelector("#joystick");
const joystickKnob = document.querySelector("#joystick-knob");
const copyEvidenceButton = document.querySelector("#copy-evidence");
const metricNames = ["net", "ticks", "guard", "corrections", "rewind", "replay", "rtt", "lease", "memory", "frame"];
const metric = Object.fromEntries(metricNames.map((name) => [name, document.querySelector(`#m-${name}`)]));
const required = [viewport, boot, bootTitle, callsignInput, runInput, enterButton, bootStatus, sessionActions, copyInviteButton, restartRoundButton, notice, joystick, joystickKnob, copyEvidenceButton, ...Object.values(metric)];`,
"session DOM contract");

app = replaceOnce(app,
`function expectedWorldId() {
  return ` + "`shared-yard-v0-${runKey}`" + `;
}`,
`function sessionRunKey() {
  return runKey || runInput.value.trim();
}

function buildInviteUrl() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  const key = sessionRunKey();
  if (RUN_KEY_PATTERN.test(key)) url.searchParams.set("run", key);
  return url.toString();
}

function canRestartRound() {
  return !runtimeFailed && networkState.startsWith("closed") && (!socket || socket.readyState === WebSocket.CLOSED);
}

function updateSessionActions() {
  const compact = boot.classList.contains("compact");
  const inviteVisible = compact && (networkState === "waiting for peer" || networkState.startsWith("closed") || networkState.startsWith("epoch ended"));
  const restartVisible = compact && canRestartRound();
  copyInviteButton.classList.toggle("hidden", !inviteVisible);
  restartRoundButton.classList.toggle("hidden", !restartVisible);
  sessionActions.classList.toggle("hidden", !inviteVisible && !restartVisible);
}

function expectedWorldId() {
  return ` + "`shared-yard-v0-${runKey}`" + `;
}`,
"session helpers");

app = replaceOnce(app,
`    networkState = ` + "`epoch ended · ${message.reason}`" + `;
    showNotice(` + "`Shared Yard epoch ended: ${message.reason}. Start a fresh run.`" + `);
    persistLastSessionEvidence("epoch-ended");
    return;`,
`    networkState = ` + "`epoch ended · ${message.reason}`" + `;
    showNotice(` + "`Shared Yard round ended: ${message.reason}. Restart when ready.`" + `);
    persistLastSessionEvidence("epoch-ended");
    updateProductStatus();
    return;`,
"epoch ended product recovery");

app = replaceOnce(app,
`  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try { handleMessage(JSON.parse(event.data)); }
    catch (error) { candidateError(error); }
  });`,
`  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    try {
      handleMessage(JSON.parse(event.data));
      updateProductStatus();
    } catch (error) { candidateError(error); }
  });`,
"responsive product status");

app = replaceOnce(app,
`    if (!runtimeFailed) showNotice("Shared Yard connection ended. World V0 intentionally requires a fresh epoch after disconnect.");`,
`    if (!runtimeFailed) showNotice("Shared Yard round ended. Restart when ready; the next round uses a fresh world epoch.");`,
"socket close recovery notice");

app = replaceOnce(app,
`    metrics: JSON.parse(JSON.stringify(metrics)),`,
`    session: {
      inviteUrl: buildInviteUrl(),
      restartAvailable: canRestartRound(),
    },
    metrics: JSON.parse(JSON.stringify(metrics)),`,
"session evidence");

app = replaceOnce(app,
`addEventListener("pagehide", () => persistLastSessionEvidence("pagehide"));`,
`addEventListener("pagehide", () => persistLastSessionEvidence("pagehide"));
window.__sharedYardV0Session = () => ({
  inviteUrl: buildInviteUrl(),
  restartAvailable: canRestartRound(),
  runKey: sessionRunKey(),
  networkState,
});`,
"session test hook");

app = replaceOnce(app,
`  if (networkState.startsWith("closed")) return "Connection ended · start a fresh run";
  if (networkState.startsWith("epoch ended")) return "World epoch ended · start a fresh run";`,
`  if (networkState.startsWith("closed")) return "Round ended · restart when ready";
  if (networkState.startsWith("epoch ended")) return "Round ending · preparing fresh epoch";`,
"session product status");

app = replaceOnce(app,
`function updateProductStatus() {
  if (!boot.classList.contains("compact")) return;`,
`function updateProductStatus() {
  updateSessionActions();
  if (!boot.classList.contains("compact")) return;`,
"session action refresh");

app = replaceOnce(app,
`  phaseAnchor = null;
  lastFrameAt = null;
  runtimeFailed = false;`,
`  phaseAnchor = null;
  lastFrameAt = null;
  keys.clear();
  touchInput = zeroInput();
  joystickPointer = null;
  joystickKnob.style.transform = "translate(0, 0)";
  cameraOrbit.pointerId = null;
  runtimeFailed = false;`,
"round input reset");

app = replaceOnce(app,
`  localStorage.setItem("shared-yard-v0-callsign", callsign);
  localStorage.setItem("shared-yard-v0-run", runKey);
  resetProtocolState();`,
`  localStorage.setItem("shared-yard-v0-callsign", callsign);
  localStorage.setItem("shared-yard-v0-run", runKey);
  const shareUrl = new URL(location.href);
  shareUrl.search = "";
  shareUrl.hash = "";
  shareUrl.searchParams.set("run", runKey);
  history.replaceState(null, "", shareUrl);
  resetProtocolState();`,
"canonical invite URL");

app = replaceOnce(app,
`enterButton.addEventListener("click", enterWorld);
copyEvidenceButton.addEventListener("click", async () => {`,
`enterButton.addEventListener("click", enterWorld);
copyInviteButton.addEventListener("click", async () => {
  const text = buildInviteUrl();
  try {
    await navigator.clipboard.writeText(text);
    copyInviteButton.textContent = "Invite copied";
    setTimeout(() => { copyInviteButton.textContent = "Copy invite"; }, 1200);
  } catch {
    console.log(` + "`Shared Yard invite: ${text}`" + `);
    showNotice("Clipboard unavailable; invite link written to console.");
  }
});
restartRoundButton.addEventListener("click", () => {
  if (!canRestartRound()) return;
  enterWorld();
});
copyEvidenceButton.addEventListener("click", async () => {`,
"session action handlers");

writeFileSync(appPath, app);

const indexPath = "public/world-v0/index.html";
let index = readFileSync(indexPath, "utf8");
index = replaceOnce(index,
`  </section>

  <details id="hud" class="panel hud">`,
`  </section>

  <div id="session-actions" class="session-actions hidden" aria-label="session actions">
    <button id="copy-invite" type="button">Copy invite</button>
    <button id="restart-round" type="button" class="hidden">Restart round</button>
  </div>

  <details id="hud" class="panel hud">`,
"session action markup");
writeFileSync(indexPath, index);

const stylesPath = "public/world-v0/styles.css";
let styles = readFileSync(stylesPath, "utf8");
if (!styles.includes(".session-actions{")) {
  styles += `\n.session-actions{position:fixed;z-index:8;top:max(72px,calc(env(safe-area-inset-top) + 60px));left:max(12px,env(safe-area-inset-left));display:flex;gap:6px;align-items:center}.session-actions button{border:1px solid rgba(113,216,191,.42);background:rgba(24,54,47,.92);color:#dffff7;border-radius:8px;padding:7px 10px;font-size:10px;font-weight:720;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.24);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}.session-actions #restart-round{border-color:rgba(240,190,112,.48);background:rgba(67,49,24,.94);color:#fff1d3}@media(max-width:720px){.session-actions{top:max(60px,calc(env(safe-area-inset-top) + 52px));left:max(9px,env(safe-area-inset-left));gap:5px}.session-actions button{padding:6px 8px;font-size:9px}}\n`;
}
writeFileSync(stylesPath, styles);

const buildPath = "public/world-v0/build-contract.js";
let build = readFileSync(buildPath, "utf8");
build = replaceOnce(
  build,
  `export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v4-playable-control";`,
  `export const WORLD_V0_BROWSER_UI_REVISION = "shared-yard-v0-browser-ui-v5-session-friction";`,
  "UI revision v5",
);
writeFileSync(buildPath, build);

for (const path of [
  "scripts/world-v0-runtime-shell-smoke.mjs",
  "scripts/world-v0-playable-interaction-smoke.mjs",
  "scripts/world-v0-playable-a1-smoke.mjs",
]) {
  let text = readFileSync(path, "utf8");
  text = text.replaceAll("shared-yard-v0-browser-ui-v4-playable-control", "shared-yard-v0-browser-ui-v5-session-friction");
  writeFileSync(path, text);
}

const a1WorkflowPath = ".github/workflows/world-v0-playable-a1.yml";
let a1Workflow = readFileSync(a1WorkflowPath, "utf8");
a1Workflow = replaceOnce(
  a1Workflow,
  `          if grep -q 'movementMapping: "camera-relative-v1"' public/world-v0/app.js && \\
             grep -q 'shared-yard-v0-browser-ui-v4-playable-control' public/world-v0/build-contract.js; then`,
  `          if grep -q 'movementMapping: "camera-relative-v1"' public/world-v0/app.js && \\
             grep -q 'from "./playable-control.js"' public/world-v0/app.js; then`,
  "future-safe A1 migration marker",
);
writeFileSync(a1WorkflowPath, a1Workflow);

console.log("WORLD_V0_SESSION_FRICTION_PATCH_APPLIED");
