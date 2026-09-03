import Box3D from "/node_modules/box3d.js/dist/box3d.inline.mjs";
import { runQ1bSimulation } from "./sim-core.js";

const status = document.querySelector("#status");
const resultNode = document.querySelector("#q1b-result");
const perturb = new URL(location.href).searchParams.get("perturb") === "1";

try {
  const b3 = await Box3D();
  const result = runQ1bSimulation(b3, { perturb });
  const payload = {
    ok: true,
    runtime: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      crossOriginIsolated: globalThis.crossOriginIsolated,
    },
    result,
  };
  resultNode.textContent = JSON.stringify(payload);
  status.textContent = perturb ? "Q1b perturbation run complete" : "Q1b baseline run complete";
  document.title = "Q1B_DONE";
} catch (error) {
  const payload = {
    ok: false,
    error: error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error),
  };
  resultNode.textContent = JSON.stringify(payload);
  status.textContent = "Q1b failed";
  document.title = "Q1B_ERROR";
}
