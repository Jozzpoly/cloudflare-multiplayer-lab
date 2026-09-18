const base = String(process.env.MW_PROXY_BASE || "").replace(/\/$/, "");
const player = String(process.env.MW_PROXY_PLAYER || "");
const run = String(process.env.MW_PROXY_RUN || "");
const resume = String(process.env.MW_PROXY_RESUME || "");
if (!base || !player || !run || !resume) throw new Error("transport proxy configuration incomplete");

const wsBase = base.replace(/^http/, "ws");
const url = new URL(`${wsBase}/world-v0/ws`);
url.searchParams.set("player", player);
url.searchParams.set("run", run);
url.searchParams.set("lifecycle", "mf6");
url.searchParams.set("resume", resume);

const ws = new WebSocket(url);
let ready = false;
const fail = (reason) => {
  if (!ready) {
    console.error("MF6_TRANSPORT_PROXY_FAIL", reason);
    process.exit(1);
  }
};

ws.addEventListener("message", (event) => {
  try {
    const message = JSON.parse(String(event.data));
    if (message.type !== "world_v0_welcome") return;
    if (message.resumed !== true) throw new Error("proxy resume was not accepted");
    ready = true;
    console.log("MF6_TRANSPORT_PROXY_READY", JSON.stringify({
      worldEpoch: message.worldEpoch,
      sessionId: message.selfSessionId,
      netEntityId: message.selfNetEntityId,
      slot: message.slot,
      resumeCount: message.resumeCount,
    }));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
});
ws.addEventListener("error", () => fail("websocket error"));
ws.addEventListener("close", (event) => fail(`closed before kill ${event.code}`));

setInterval(() => {}, 1000);
