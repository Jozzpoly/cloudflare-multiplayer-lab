import { readFileSync, writeFileSync } from "node:fs";

const path = "public/world-v0/app.js";
const marker = "WORLD_V0_REENTRY_PRESENTATION_BARRIER_V24";
let source = readFileSync(path, "utf8");
if (source.includes(marker)) {
  console.log("reentry presentation barrier v24 already installed");
  process.exit(0);
}
if (!source.includes("WORLD_V0_PHASE_DELAY_REMOTE_V13")) throw new Error("V24 requires V13 presentation controls");

const seam = `  updateCamera();\n  renderer.render(scene, camera);`;
const replacement = `  updateCamera();\n  if (typeof window.__mwV24ShouldRender !== "function" || window.__mwV24ShouldRender()) {\n    renderer.render(scene, camera);\n    if (typeof window.__mwV24RecordRender === "function") window.__mwV24RecordRender();\n  }`;
const first = source.indexOf(seam);
if (first < 0 || source.indexOf(seam, first + seam.length) >= 0) throw new Error("V24 frame render seam missing or ambiguous");
source = source.slice(0, first) + replacement + source.slice(first + seam.length);

source += `\n// ${marker}: test-only lifecycle presentation barrier. Exact simulation, input,\n// authority and state guards continue while historical catch-up frames are not rendered.\n{\n  const state = { hiddenAt: null, hold: false, holdStartedAt: null, releasedAt: null, suppressed: 0, renders: [] };\n  const distance = (a, b) => a && b ? Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]) : null;\n  document.addEventListener("visibilitychange", () => {\n    const now = performance.now();\n    if (document.visibilityState !== "visible") {\n      state.hiddenAt = now;\n      return;\n    }\n    const hiddenMs = state.hiddenAt === null ? 0 : Math.max(0, now - state.hiddenAt);\n    state.hiddenAt = null;\n    if (hiddenMs >= 250) {\n      state.hold = true;\n      state.holdStartedAt = now;\n      state.releasedAt = null;\n      state.suppressed = 0;\n      state.renders = [];\n    }\n  });\n  window.__mwV24ShouldRender = () => {\n    if (!state.hold) return true;\n    const local = Number.isInteger(localState?.boundaryTick) ? localState.boundaryTick : null;\n    const authority = Number.isInteger(metrics.latestAuthorityBoundary) ? metrics.latestAuthorityBoundary : null;\n    const exactReady = Number.isInteger(local) && Number.isInteger(authority) && local >= authority - 4;\n    const v13 = window.__mwV13ReadPresentation?.();\n    const latest = v13?.samples?.[v13.samples.length - 1] ?? null;\n    const presentationReady = latest && (latest.mode === "interpolate" || latest.mode === "latest-exact");\n    if (exactReady && presentationReady) {\n      state.hold = false;\n      state.releasedAt = performance.now();\n      return true;\n    }\n    state.suppressed += 1;\n    return false;\n  };\n  window.__mwV24RecordRender = () => {\n    const p = remoteMesh ? [remoteMesh.position.x, remoteMesh.position.y, remoteMesh.position.z] : null;\n    const prev = state.renders.length ? state.renders[state.renders.length - 1].position : null;\n    const v13 = window.__mwV13ReadPresentation?.();\n    const latest = v13?.samples?.[v13.samples.length - 1] ?? null;\n    state.renders.push({\n      t: performance.now(), position: p, stepMeters: distance(prev, p),\n      localBoundary: localState?.boundaryTick ?? null, authorityBoundary: metrics.latestAuthorityBoundary,\n      presentationMode: latest?.mode ?? null,\n    });\n    if (state.renders.length > 512) state.renders.splice(0, state.renders.length - 512);\n  };\n  window.__mwV24ReadBarrier = () => ({\n    hold: state.hold, holdStartedAt: state.holdStartedAt, releasedAt: state.releasedAt,\n    holdDurationMs: state.holdStartedAt !== null && state.releasedAt !== null ? state.releasedAt - state.holdStartedAt : null,\n    suppressedFrames: state.suppressed, renders: state.renders.map((x) => ({ ...x, position: x.position ? [...x.position] : null })),\n  });\n}\n`;

writeFileSync(path, source);
console.log("WORLD_V0_REENTRY_PRESENTATION_BARRIER_V24_INSTALLED");
