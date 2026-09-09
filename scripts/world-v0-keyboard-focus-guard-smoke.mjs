import assert from "node:assert/strict";
import {
  WORLD_V0_KEYBOARD_FOCUS_GUARD_REVISION,
  installWorldV0KeyboardFocusGuard,
  worldV0UiOwnsKeyboard,
} from "../public/world-v0/keyboard-focus-guard.js";

assert.equal(WORLD_V0_KEYBOARD_FOCUS_GUARD_REVISION, "world-v0-keyboard-focus-guard-v1");
assert.equal(worldV0UiOwnsKeyboard({ tagName: "INPUT" }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "TEXTAREA" }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "SELECT" }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "BUTTON" }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "SUMMARY" }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "DIV", isContentEditable: true }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "DIV" }), false);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "A", href: "https://example.test/" }), true);
assert.equal(worldV0UiOwnsKeyboard({ tagName: "A", href: "" }), false);
assert.equal(worldV0UiOwnsKeyboard({
  tagName: "SPAN",
  parentElement: { tagName: "BUTTON" },
}), true);

let keydownListener = null;
const root = {
  addEventListener(type, listener) {
    if (type === "keydown") keydownListener = listener;
  },
};
installWorldV0KeyboardFocusGuard(root);
assert.equal(typeof keydownListener, "function");

let stopped = 0;
keydownListener({
  target: { tagName: "INPUT" },
  stopImmediatePropagation() { stopped += 1; },
});
assert.equal(stopped, 1, "editable input must stop later gameplay keydown listeners");

keydownListener({
  target: { tagName: "CANVAS" },
  stopImmediatePropagation() { stopped += 1; },
});
assert.equal(stopped, 1, "gameplay surface must continue to gameplay keydown listeners");

console.log("WORLD_V0_KEYBOARD_FOCUS_GUARD_PASS");
