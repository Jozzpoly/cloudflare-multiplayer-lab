import "./keyboard-focus-guard.js";

const bootstrapUrl = new URL(location.href);
const canonicalPublicYards = new Set(["yard-1", "yard-2", "yard-3"]);
const requestedRun = (bootstrapUrl.searchParams.get("run") || "").trim();
const ongoingPublicYard = requestedRun === "" || canonicalPublicYards.has(requestedRun);
if (ongoingPublicYard) {
  bootstrapUrl.searchParams.set("lifecycle", "r0");
  history.replaceState(null, "", bootstrapUrl);
}

// Keep gameplay input listeners behind the UI keyboard guard. The dynamic import
// makes the ordering explicit: focused form controls receive their keys before the
// playable runtime installs its window-level WASD / Space handlers.
await import("./friend-ready.js");

if (ongoingPublicYard) {
  const inspectButton = document.querySelector("#inspect-solo");
  const advancedSummary = document.querySelector("#entry-advanced > summary");
  if (inspectButton) inspectButton.hidden = true;
  if (advancedSummary) advancedSummary.textContent = "Advanced";
}
