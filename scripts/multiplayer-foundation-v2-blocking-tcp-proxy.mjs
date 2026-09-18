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

export function createBlockingTcpProxy({ target, port }) {
  const targetUrl = target instanceof URL ? target : new URL(target);
  let blocked = false;
  let accepted = 0;
  let blockedAccepts = 0;
  let hardDrops = 0;
  const pairs = new Set();

  const server = net.createServer((client) => {
    accepted += 1;
    client.setNoDelay(true);

    if (blocked) {
      blockedAccepts += 1;
      hardClose(client);
      return;
    }

    const upstream = net.connect({
      host: targetUrl.hostname,
      port: Number(targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80)),
    });
    upstream.setNoDelay(true);
    const pair = { client, upstream };
    pairs.add(pair);

    const retire = () => {
      pairs.delete(pair);
      hardClose(client);
      hardClose(upstream);
    };
    client.on("error", retire);
    upstream.on("error", retire);
    client.on("close", () => { pairs.delete(pair); hardClose(upstream); });
    upstream.on("close", () => { pairs.delete(pair); hardClose(client); });

    client.pipe(upstream);
    upstream.pipe(client);
  });

  return {
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
    },
    blockAndDropAll() {
      blocked = true;
      const activeBeforeDrop = pairs.size;
      for (const pair of [...pairs]) {
        hardDrops += 1;
        hardClose(pair.client);
        hardClose(pair.upstream);
        pairs.delete(pair);
      }
      return { activeBeforeDrop, hardDrops };
    },
    unblock() { blocked = false; },
    snapshot() {
      return { blocked, activePairs: pairs.size, accepted, blockedAccepts, hardDrops };
    },
    async close() {
      blocked = true;
      for (const pair of [...pairs]) {
        hardClose(pair.client);
        hardClose(pair.upstream);
      }
      pairs.clear();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
