export const WORLD_V0_KEYBOARD_FOCUS_GUARD_REVISION = "world-v0-keyboard-focus-guard-v1";

const UI_KEYBOARD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "SUMMARY", "A"]);

export function worldV0UiOwnsKeyboard(target) {
  let current = target;
  while (current && typeof current === "object") {
    const tagName = String(current.tagName || "").toUpperCase();
    if (UI_KEYBOARD_TAGS.has(tagName)) {
      if (tagName !== "A" || current.href || current.getAttribute?.("href") != null) return true;
    }
    if (current.isContentEditable === true) return true;
    const contentEditable = current.getAttribute?.("contenteditable");
    if (contentEditable != null && String(contentEditable).toLowerCase() !== "false") return true;
    current = current.parentElement || null;
  }
  return false;
}

export function installWorldV0KeyboardFocusGuard(root) {
  if (!root?.addEventListener) throw new Error("World V0 keyboard focus guard requires an event target");
  root.addEventListener("keydown", (event) => {
    if (!worldV0UiOwnsKeyboard(event.target)) return;
    // Do not prevent the browser's default action. The focused control still owns
    // typing / Enter / Space; we only prevent later window-level gameplay handlers
    // from also consuming the same key.
    event.stopImmediatePropagation();
  });
}

if (typeof window !== "undefined") installWorldV0KeyboardFocusGuard(window);
