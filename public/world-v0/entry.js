import "./keyboard-focus-guard.js";

const bootstrapUrl = new URL(location.href);
const canonicalPublicYards = new Set(["yard-1", "yard-2", "yard-3"]);
const requestedRun = (bootstrapUrl.searchParams.get("run") || "").trim();
const ongoingPublicYard = requestedRun === "" || canonicalPublicYards.has(requestedRun);
if (ongoingPublicYard) {
  bootstrapUrl.searchParams.set("lifecycle", "r0");
  history.replaceState(null, "", bootstrapUrl);
}

// Explicit MF6 research flag only. Recover the strict-IDB ActorSession in native
// boot order, before friend-ready.js or app.js reads the legacy session store.
// The authority still validates the bearer token; this hydration grants no rights.
if(new URLSearchParams(location.search).get("mf6DurableResumeProbe")==="1" &&
   new URLSearchParams(location.search).get("lifecycle")==="mf6"){
  const {mf6HydrateDurableResumeOnBoot}=await import("./mf6-durable-resume-probe.js");
  const state=await mf6HydrateDurableResumeOnBoot(location.search);
  window.__mf6DurableResumeProbe={bootMode:state.mode,commit:"idle"};
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
