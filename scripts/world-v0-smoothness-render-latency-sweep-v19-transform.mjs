import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2] || "/tmp/world-v0-smoothness-render-correction-batching-v18-probe.mjs";
const output = process.argv[3] || "/tmp/world-v0-smoothness-render-latency-sweep-v19-probe.mjs";
let source = readFileSync(input, "utf8");

function replaceOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`V19 transform missing seam: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`V19 transform ambiguous seam: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("`V18Node-${Date.now().toString(36)}`", "`V19Node-${Date.now().toString(36)}`", "raw peer name");
replaceOnce("`v18-${Date.now().toString(36)}`", "`v19-${Date.now().toString(36)}`", "run key");
replaceOnce("c.value='V18Browser'", "c.value='V19Browser'", "browser name");
replaceOnce("world-v0-smoothness-correction-batching-v18", "world-v0-smoothness-latency-sweep-v19", "result revision");
replaceOnce("correction_batching_v18_complete", "latency_sweep_v19_complete", "close reason");

writeFileSync(output, source);
console.log(`WORLD_V0_RENDER_LATENCY_SWEEP_V19_TRANSFORMED ${output}`);
