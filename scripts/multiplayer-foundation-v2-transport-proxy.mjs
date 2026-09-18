import net from "node:net";
import { createHash, randomBytes } from "node:crypto";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function parseFrame(buffer) {
  if (buffer.length < 2) return null;
  const first = buffer[0];
  const second = buffer[1];
  const fin = Boolean(first & 0x80);
  const opcode = first & 0x0f;
  const masked = Boolean(second & 0x80);
  let length = second & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    const wide = buffer.readBigUInt64BE(2);
    if (wide > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("raw websocket frame too large");
    length = Number(wide);
    offset = 10;
  }

  let mask = null;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }
  if (buffer.length < offset + length) return null;

  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (mask) {
    for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
  }
  return {
    fin,
    opcode,
    payload,
    rest: buffer.subarray(offset + length),
  };
}

export async function openMf6ResumeTransport({
  base,
  player,
  run,
  resume,
  timeoutMs = 10_000,
}) {
  const baseUrl = new URL(base);
  assert(baseUrl.protocol === "http:", "raw MF6 resume transport currently requires local http Workerd");
  const host = baseUrl.hostname;
  const port = Number(baseUrl.port || 80);
  const path = new URL("/world-v0/ws", baseUrl);
  path.searchParams.set("player", player);
  path.searchParams.set("run", run);
  path.searchParams.set("lifecycle", "mf6");
  path.searchParams.set("resume", resume);

  const key = randomBytes(16).toString("base64");
  const expectedAccept = createHash("sha1").update(key + WS_GUID).digest("base64");
  const socket = net.createConnection({ host, port });
  socket.setNoDelay(true);

  let settled = false;
  let upgraded = false;
  let buffer = Buffer.alloc(0);
  let timer = null;

  const result = await new Promise((resolve, reject) => {
    const fail = (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { socket.destroy(); } catch {}
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    timer = setTimeout(() => fail(new Error("raw MF6 resume transport timeout")), timeoutMs);

    socket.once("connect", () => {
      const request = [
        `GET ${path.pathname}${path.search} HTTP/1.1`,
        `Host: ${baseUrl.host}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n");
      socket.write(request);
    });

    socket.on("data", (chunk) => {
      try {
        buffer = Buffer.concat([buffer, chunk]);
        if (!upgraded) {
          const end = buffer.indexOf("\r\n\r\n");
          if (end < 0) return;
          const headerText = buffer.subarray(0, end).toString("utf8");
          const lines = headerText.split("\r\n");
          assert(/^HTTP\/1\.1 101\b/.test(lines[0]), `raw websocket upgrade failed: ${lines[0]}`);
          const headers = new Map(lines.slice(1).map((line) => {
            const colon = line.indexOf(":");
            return [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()];
          }));
          assert(headers.get("sec-websocket-accept") === expectedAccept, "raw websocket accept mismatch");
          upgraded = true;
          buffer = buffer.subarray(end + 4);
        }

        while (true) {
          const frame = parseFrame(buffer);
          if (!frame) return;
          buffer = frame.rest;
          if (frame.opcode === 0x8) throw new Error("raw websocket closed before resume welcome");
          if (frame.opcode !== 0x1 || !frame.fin) continue;
          const message = JSON.parse(frame.payload.toString("utf8"));
          if (message.type !== "world_v0_welcome") continue;
          assert(message.resumed === true, "raw resume transport was not accepted");
          settled = true;
          if (timer) clearTimeout(timer);
          resolve({
            socket,
            welcome: message,
            reset() {
              if (socket.destroyed) return;
              if (typeof socket.resetAndDestroy === "function") socket.resetAndDestroy();
              else socket.destroy(new Error("forced transport reset"));
            },
          });
          return;
        }
      } catch (error) {
        fail(error);
      }
    });

    socket.once("error", fail);
    socket.once("close", () => {
      if (!settled) fail(new Error("raw websocket closed before resume welcome"));
    });
  });

  return result;
}
