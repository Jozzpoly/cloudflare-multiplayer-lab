const FORCE_TOUCH = new URLSearchParams(location.search).get("touch") === "1";
const touchCapable = FORCE_TOUCH || navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
const controls = document.querySelector("#touch-controls");
const hud = document.querySelector("#hud");

if (!controls || !hud) throw new Error("WS0 touch control surface incomplete");

const CODE_BY_DIRECTION = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

const pointerToCode = new Map();
const codeRefCounts = new Map();
const stats = {
  pointerDowns: 0,
  pointerReleases: 0,
  keyDowns: 0,
  keyUps: 0,
  lastDirection: null,
};

function emitKey(type, code) {
  const event = new KeyboardEvent(type, {
    code,
    key: code,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  if (type === "keydown") stats.keyDowns += 1;
  else stats.keyUps += 1;
}

function setButtonActive(code, active) {
  for (const button of controls.querySelectorAll(".touch-dir")) {
    if (CODE_BY_DIRECTION[button.dataset.dir] === code) button.classList.toggle("active", active);
  }
}

function press(pointerId, code, direction, button) {
  if (pointerToCode.has(pointerId)) return;
  pointerToCode.set(pointerId, code);
  const count = codeRefCounts.get(code) ?? 0;
  codeRefCounts.set(code, count + 1);
  stats.pointerDowns += 1;
  stats.lastDirection = direction;
  button.classList.add("active");
  if (count === 0) emitKey("keydown", code);
}

function release(pointerId) {
  const code = pointerToCode.get(pointerId);
  if (!code) return;
  pointerToCode.delete(pointerId);
  const next = Math.max(0, (codeRefCounts.get(code) ?? 1) - 1);
  stats.pointerReleases += 1;
  if (next === 0) {
    codeRefCounts.delete(code);
    setButtonActive(code, false);
    emitKey("keyup", code);
  } else {
    codeRefCounts.set(code, next);
  }
}

function releaseAll() {
  for (const pointerId of [...pointerToCode.keys()]) release(pointerId);
}

for (const button of controls.querySelectorAll(".touch-dir")) {
  const direction = button.dataset.dir;
  const code = CODE_BY_DIRECTION[direction];
  if (!code) throw new Error(`Unknown touch direction ${direction}`);

  button.addEventListener("pointerdown", (event) => {
    if (!touchCapable) return;
    event.preventDefault();
    try { button.setPointerCapture(event.pointerId); } catch { /* capture is QoL, not semantics */ }
    press(event.pointerId, code, direction, button);
  });
  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    release(event.pointerId);
  });
  button.addEventListener("pointercancel", (event) => release(event.pointerId));
  button.addEventListener("lostpointercapture", (event) => release(event.pointerId));
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

function updateVisibility() {
  const playing = !hud.classList.contains("hidden");
  controls.classList.toggle("visible", touchCapable && playing);
}

new MutationObserver(updateVisibility).observe(hud, { attributes: true, attributeFilter: ["class"] });
window.addEventListener("blur", releaseAll);
window.addEventListener("pagehide", releaseAll);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") releaseAll();
});

document.body.dataset.touchCapable = touchCapable ? "true" : "false";
updateVisibility();

window.__WS0_TOUCH__ = {
  snapshot() {
    return {
      revision: "ws0-human-touch-dpad-v1",
      touchCapable,
      forced: FORCE_TOUCH,
      visible: controls.classList.contains("visible"),
      activeCodes: [...codeRefCounts.keys()].sort(),
      activePointers: pointerToCode.size,
      ...stats,
    };
  },
};
