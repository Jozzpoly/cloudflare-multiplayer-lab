import assert from "node:assert/strict";
import {
  WORLD_V0_KEYBOARD_FOCUS_GUARD_REVISION,
  installWorldV0KeyboardFocusGuard,
  worldV0UiOwnsGameplayKey,
  worldV0UiOwnsKeyboard,
} from "../public/world-v0/keyboard-focus-guard.js";

assert.equal(WORLD_V0_KEYBOARD_FOCUS_GUARD_REVISION, "world-v0-keyboard-focus-guard-v2-semantic-ownership");
assert.equal(worldV0UiOwnsKeyboard({ tagName: "INPUT" }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "TEXTAREA" }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "SELECT" }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "BUTTON" }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "SUMMARY" }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "DIV", isContentEditable: true }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "DIV" }), false);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "A", href: "https://example.test/" }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "A", href: "" }), false);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "SPAN", parentElement: { tagName: "BUTTON" } }), true);

assert.equal(worldV0UiOwnsGameplayKey({ tagName: "INPUT" }, { code: "KeyW", key: "w" }), true);
assert.equal(worldV0UiOwnsGameplayKey({ tagName: "SUMMARY" }, { code: "KeyW", key: "w" }), false, "stale summary focus must not steal WASD");
assert.equal(worldV0UiOwnsGameplayKey({ tagName: "BUTTON" }, { code: "KeyA", key: "a" }), false, "stale button focus must not steal WASD");
assert.equal(worldV0UiOwnsGameplayKey({ tagName: "SUMMARY" }, { code: "Space", key: " " }), true, "summary must keep native Space activation");
assert.equal(worldV0UiOwnsGameplayKey({ tagName: "BUTTON" }, { code: "Enter", key: "Enter" }), true, "button must keep native Enter activation");
assert.equal(worldV0UiOwnsGameplayKey({ tagName: "CANVAS" }, { code: "KeyW", key: "w" }), false);

const listeners = new Map();
const root = {
  addEventListener(type, listener) { listeners.set(type, listener); },
};
installWorldV0KeyboardFocusGuard(root);
assert.equal(typeof listeners.get("keydown"), "function");
assert.equal(typeof listeners.get("keyup"), "function");

function dispatch(type, target, event) {
  let stopped = 0;
  listeners.get(type)({
    target,
    ...event,
    stopImmediatePropagation() { stopped += 1; },
  });
  return stopped;
}

for (const type of ["keydown", "keyup"]) {
  assert.equal(dispatch(type, { tagName: "INPUT" }, { code: "KeyW", key: "w" }), 1, `editable input must own ${type}`);
  assert.equal(dispatch(type, { tagName: "SUMMARY" }, { code: "KeyW", key: "w" }), 0, `summary focus must release WASD ${type}`);
  assert.equal(dispatch(type, { tagName: "SUMMARY" }, { code: "Space", key: " " }), 1, `summary must own Space ${type}`);
  assert.equal(dispatch(type, { tagName: "CANVAS" }, { code: "KeyW", key: "w" }), 0, `gameplay surface must receive ${type}`);
}

console.log("WORLD_V0_KEYBOARD_FOCUS_GUARD_PASS");
