import "./keyboard-focus-guard.js";

// Keep gameplay input listeners behind the UI keyboard guard. The dynamic import
// makes the ordering explicit: focused form controls receive their keys before the
// playable runtime installs its window-level WASD / Space handlers.
await import("./friend-ready.js");
