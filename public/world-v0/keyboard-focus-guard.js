export const WORLD_V0_KEYBOARD_FOCUS_GUARD_REVISION = "world-v0-keyboard-focus-guard-v3-pointer-focus-release";

const EDITABLE_UI_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const ACTION_UI_TAGS = new Set(["BUTTON", "SUMMARY", "A"]);

function keyboardOwner(target) {
  let current = target;
  while (current && typeof current === "object") {
    const tagName = String(current.tagName || "").toUpperCase();
    if (EDITABLE_UI_TAGS.has(tagName)) return { kind: "editable", element: current };
    if (ACTION_UI_TAGS.has(tagName)) {
      if (tagName !== "A" || current.href || current.getAttribute?.("href") != null) return { kind: "action", element: current };
    }
    if (current.isContentEditable === true) return { kind: "editable", element: current };
    const contentEditable = current.getAttribute?.("contenteditable");
    if (contentEditable != null && String(contentEditable).toLowerCase() !== "false") return { kind: "editable", element: current };
    current = current.parentElement || null;
  }
  return null;
}

function uiKeyboardOwner(target) {
  return keyboardOwner(target)?.kind ?? null;
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
  const releasePointerActionFocus = (event) => {
    // Pointer activation should not leave a stale action control owning the next
    // gameplay Space/Enter. Keyboard activation has click detail=0 and keeps focus,
    // preserving ordinary keyboard accessibility for buttons/links/<summary>.
    if (!(Number(event.detail) > 0)) return;
    const owner = keyboardOwner(event.target);
    if (owner?.kind !== "action") return;
    owner.element?.blur?.();
  };
  root.addEventListener("keydown", guard);
  root.addEventListener("keyup", guard);
  root.addEventListener("click", releasePointerActionFocus);
}

if (typeof window !== "undefined") installWorldV0KeyboardFocusGuard(window);
