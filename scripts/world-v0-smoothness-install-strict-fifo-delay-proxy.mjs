import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("./world-v0-smoothness-jump-rapid-repress-probe.mjs", import.meta.url);
let source = readFileSync(path, "utf8");

const startMarker = "function createOrderedDelayProxy() {";
const endMarker = "\nfunction findChrome() {";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error("strict FIFO proxy seam missing");
if (source.indexOf(startMarker, start + startMarker.length) >= 0) throw new Error("strict FIFO proxy seam non-unique");

const replacement = `function createOrderedDelayProxy() {
  let delayMs = 0;
  const pairs = new Set();
  let delayedChunks = 0;
  let delayedBytes = 0;
  let maxQueuedChunks = 0;

  const server = net.createServer((client) => {
    client.setNoDelay(true);
    const upstream = net.connect({ host: TARGET.hostname, port: Number(TARGET.port || 80) });
    upstream.setNoDelay(true);
    const pair = { client, upstream, queue: [], drainTimer: null };
    pairs.add(pair);

    const clearDrainTimer = () => {
      if (pair.drainTimer) clearTimeout(pair.drainTimer);
      pair.drainTimer = null;
    };
    const retire = () => {
      clearDrainTimer();
      pair.queue.length = 0;
      pairs.delete(pair);
      hardClose(client);
      hardClose(upstream);
    };
    const drain = () => {
      pair.drainTimer = null;
      while (pair.queue.length && !upstream.destroyed) {
        const head = pair.queue[0];
        const wait = head.notBefore - Date.now();
        if (wait > 0) {
          pair.drainTimer = setTimeout(drain, wait);
          return;
        }
        pair.queue.shift();
        upstream.write(head.payload);
      }
    };

    client.on("error", retire);
    upstream.on("error", retire);
    client.on("close", () => { clearDrainTimer(); pair.queue.length = 0; pairs.delete(pair); hardClose(upstream); });
    upstream.on("close", () => { clearDrainTimer(); pair.queue.length = 0; pairs.delete(pair); hardClose(client); });
    client.on("data", (chunk) => {
      const payload = Buffer.from(chunk);
      const configuredDelay = delayMs;
      if (configuredDelay <= 0 && pair.queue.length === 0 && pair.drainTimer === null) {
        if (!upstream.destroyed) upstream.write(payload);
        return;
      }
      if (configuredDelay > 0) {
        delayedChunks += 1;
        delayedBytes += payload.byteLength;
      }
      pair.queue.push({ payload, notBefore: Date.now() + configuredDelay });
      maxQueuedChunks = Math.max(maxQueuedChunks, pair.queue.length);
      if (pair.drainTimer === null) drain();
    });
    upstream.on("data", (chunk) => { if (!client.destroyed) client.write(chunk); });
  });

  return {
    async listen() { await new Promise((resolve, reject) => { server.once("error", reject); server.listen(PROXY_PORT, "127.0.0.1", resolve); }); },
    setDelay(ms) { delayMs = Math.max(0, Number(ms) || 0); },
    snapshot() {
      const queuedChunks = [...pairs].reduce((sum, pair) => sum + pair.queue.length, 0);
      return { delayMs, delayedChunks, delayedBytes, activePairs: pairs.size, queuedChunks, maxQueuedChunks, transportRevision: "strict-fifo-single-drain-v1" };
    },
    async close() {
      for (const pair of [...pairs]) {
        if (pair.drainTimer) clearTimeout(pair.drainTimer);
        pair.drainTimer = null;
        pair.queue.length = 0;
        hardClose(pair.client);
        hardClose(pair.upstream);
      }
      pairs.clear();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
`;

source = source.slice(0, start) + replacement + source.slice(end);
if (!source.includes('transportRevision: "strict-fifo-single-drain-v1"')) throw new Error("strict FIFO proxy marker missing");
writeFileSync(path, source);
console.log("WORLD_V0_STRICT_FIFO_DELAY_PROXY_INSTALLED");
