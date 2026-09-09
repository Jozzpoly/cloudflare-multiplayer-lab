import { readFileSync, writeFileSync } from "node:fs";

await import("./apply-world-v0-vacant-capacity-refinement-v3.mjs");

const path = "scripts/world-v0-vacant-capacity-authority-probe.mjs";
const source = readFileSync(path, "utf8");
const from = `async function closeAndWait(client, reason) {
  if (client.ws.readyState === WebSocket.OPEN) client.ws.close(1000, reason);
  await waitFor(() => client.state.closed, \`${"${client.playerId}"} close\`);
}`;
const to = `async function closeAndWait(client, reason) {
  // Node's experimental WebSocket close callback is not the lifecycle authority.
  // Request transport close, then let the following Durable Object directory poll
  // prove when the server has actually detached the socket.
  try { client.ws.close(1000, reason); } catch {}
  await sleep(80);
}`;
const first = source.indexOf(from);
if (first < 0 || source.indexOf(from, first + from.length) >= 0) {
  throw new Error("vacant authority probe close observer was not exactly the expected callback-based apparatus");
}
writeFileSync(path, source.slice(0, first) + to + source.slice(first + from.length));

console.log("WORLD_V0_VACANT_CAPACITY_AUTHORITY_OBSERVER_REFINED");
