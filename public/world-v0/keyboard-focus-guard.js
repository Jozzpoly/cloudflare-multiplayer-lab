export const WORLD_V0_KEYBOARD_FOCUS_GUARD_REVISION = "world-v0-keyboard-focus-guard-v2-semantic-ownership";

const EDITABLE_UI_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const ACTION_UI_TAGS = new Set(["BUTTON", "SUMMARY", "A"]);

function uiKeyboardOwner(target) {
  let current = target;
  while (current && typeof current === "object") {
    const tagName = String(current.tagName || "").toUpperCase();
    if (EDITABLE_UI_TAGS.has(tagName)) return "editable";
    if (ACTION_UI_TAGS.has(tagName)) {
      if (tagName !== "A" || current.href || current.getAttribute?.("href") != null) return "action";
    }
    if (current.isContentEditable === true) return "editable";
    const contentEditable = current.getAttribute?.("contenteditable");
    if (contentEditable != null && String(contentEditable).toLowerCase() !== "false") return "editable";
    current = current.parentElement || null;
  }
  return null;
}

export function worldV0UiOwnsKeyboard(target) {
  return uiKeyboardOwner(target) !== null;
}

export function worldV0UiOwnsGameplayKey(target, event = {}) {
  const owner = uiKeyboardOwner(target);
  if (owner === "editable") return true;
  if (owner !== "action") return false;

  // Buttons, links and <summary> need their activation keys, but a stale focus ring
  // must not permanently steal movement after the user merely clicked UI. Let WASD
  // pass to gameplay while preserving native Space/Enter activation semantics.
  const code = String(event.code || "");
  const key = String(event.key || "");
  return code === "Space" || code === "Enter" || code === "NumpadEnter" || key === "Enter" || key === " ";
}

export function installWorldV0KeyboardFocusGuard(root) {
  if (!root?.addEventListener) throw new Error("World V0 keyboard focus guard requires an event target");
  const guard = (event) => {
    if (!worldV0UiOwnsGameplayKey(event.target, event)) return;
    // Do not prevent the browser default. UI keeps its native editing/activation;
    // only later window-level gameplay listeners are suppressed for that key.
    event.stopImmediatePropagation();
  };
  root.addEventListener("keydown", guard);
  root.addEventListener("keyup", guard);
}

if (typeof window !== "undefined") installWorldV0KeyboardFocusGuard(window);
