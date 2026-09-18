import net from "node:net";

function hardClose(socket) {
  if (!socket || socket.destroyed) return;
  try {
    if (typeof socket.resetAndDestroy === "function") socket.resetAndDestroy();
    else socket.destroy();
  } catch {
    try { socket.destroy(); } catch {}
  }
}

function createRng(seed) {
  let state = (Number(seed) >>> 0) || 0x6d2b79f5;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createDirection({ source, target, rng, metrics, profileRef }) {
  const queue = [];
  let timer = null;
  let lastReleaseAt = 0;
  let disposed = false;

  const schedule = () => {
    if (disposed || timer || queue.length === 0) return;
    const delay = Math.max(0, queue[0].releaseAt - Date.now());
    timer = setTimeout(() => {
      timer = null;
      if (disposed) return;
      const now = Date.now();
      while (queue.length > 0 && queue[0].releaseAt <= now) {
        const item = queue.shift();
        if (!target.destroyed) target.write(item.chunk);
      }
      schedule();
    }, delay);
  };

  const onData = (chunk) => {
    if (disposed) return;
    const profile = profileRef();
    metrics.chunks += 1;
    metrics.bytes += chunk.length;

    const mustQueue = queue.length > 0 || Boolean(timer) || profile.enabled;
    if (!mustQueue) {
      if (!target.destroyed) target.write(chunk);
      return;
    }

    const now = Date.now();
    let requestedDelay = 0;
    if (profile.enabled) {
      const sampledJitter = profile.jitterMs > 0
        ? ((rng() * 2) - 1) * profile.jitterMs
        : 0;
      requestedDelay = Math.max(0, profile.latencyMs + sampledJitter);
      metrics.shapedChunks += 1;
    } else {
      metrics.carryoverChunks += 1;
    }

    // Every byte chunk receives one monotonically increasing release timestamp.
    // This preserves TCP byte order even when sampled jitter would otherwise make
    // a newer chunk eligible before an older chunk.
    const releaseAt = Math.max(now + requestedDelay, lastReleaseAt + 1);
    lastReleaseAt = releaseAt;
    const actualDelay = Math.max(0, releaseAt - now);

    if (profile.enabled) {
      metrics.delaySumMs += actualDelay;
      metrics.minDelayMs = metrics.minDelayMs === null ? actualDelay : Math.min(metrics.minDelayMs, actualDelay);
      metrics.maxDelayMs = Math.max(metrics.maxDelayMs, actualDelay);
    }

    queue.push({ chunk: Buffer.from(chunk), releaseAt });
    metrics.maxQueueDepth = Math.max(metrics.maxQueueDepth, queue.length);
    schedule();
  };

  source.on("data", onData);
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      source.off("data", onData);
      if (timer) clearTimeout(timer);
      timer = null;
      queue.length = 0;
    },
    snapshot() {
      return { queuedChunks: queue.length, lastReleaseAt };
    },
  };
}

export function createShapedTcpProxy({ target, port, seed = 1 }) {
  const targetUrl = target instanceof URL ? target : new URL(target);
  let profile = { name: "passthrough", enabled: false, latencyMs: 0, jitterMs: 0 };
  let accepted = 0;
  const pairs = new Set();
  const rng = createRng(seed);
  const makeMetrics = () => ({
    chunks: 0,
    bytes: 0,
    shapedChunks: 0,
    carryoverChunks: 0,
    delaySumMs: 0,
    minDelayMs: null,
    maxDelayMs: 0,
    maxQueueDepth: 0,
  });
  const metrics = {
    clientToUpstream: makeMetrics(),
    upstreamToClient: makeMetrics(),
  };

  const server = net.createServer((client) => {
    accepted += 1;
    client.setNoDelay(true);

    const upstream = net.connect({
      host: targetUrl.hostname,
      port: Number(targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80)),
    });
    upstream.setNoDelay(true);

    const c2u = createDirection({
      source: client,
      target: upstream,
      rng,
      metrics: metrics.clientToUpstream,
      profileRef: () => profile,
    });
    const u2c = createDirection({
      source: upstream,
      target: client,
      rng,
      metrics: metrics.upstreamToClient,
      profileRef: () => profile,
    });
    const pair = { client, upstream, c2u, u2c, retired: false };
    pairs.add(pair);

    const retire = () => {
      if (pair.retired) return;
      pair.retired = true;
      pairs.delete(pair);
      c2u.dispose();
      u2c.dispose();
      hardClose(client);
      hardClose(upstream);
    };
    client.on("error", retire);
    upstream.on("error", retire);
    client.on("close", retire);
    upstream.on("close", retire);
  });

  return {
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
    },
    setProfile(next) {
      profile = {
        name: String(next?.name || "shaped"),
        enabled: next?.enabled !== false,
        latencyMs: Math.max(0, Number(next?.latencyMs || 0)),
        jitterMs: Math.max(0, Number(next?.jitterMs || 0)),
      };
      return { ...profile };
    },
    passthrough() {
      profile = { name: "passthrough", enabled: false, latencyMs: 0, jitterMs: 0 };
      return { ...profile };
    },
    snapshot() {
      const summarize = (value) => ({
        ...value,
        meanDelayMs: value.shapedChunks > 0 ? value.delaySumMs / value.shapedChunks : 0,
      });
      return {
        profile: { ...profile },
        accepted,
        activePairs: pairs.size,
        clientToUpstream: summarize(metrics.clientToUpstream),
        upstreamToClient: summarize(metrics.upstreamToClient),
        pairQueues: [...pairs].map((pair) => ({
          clientToUpstream: pair.c2u.snapshot().queuedChunks,
          upstreamToClient: pair.u2c.snapshot().queuedChunks,
        })),
      };
    },
    async close() {
      for (const pair of [...pairs]) {
        pair.c2u.dispose();
        pair.u2c.dispose();
        hardClose(pair.client);
        hardClose(pair.upstream);
        pair.retired = true;
      }
      pairs.clear();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
