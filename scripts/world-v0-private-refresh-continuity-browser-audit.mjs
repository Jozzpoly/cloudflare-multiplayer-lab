import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }
function findChrome() {
  const override = process.env.CHROME_BIN?.trim();
  if (override) return override;
  const probe = spawnSync("bash", ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"], { encoding: "utf8" });
  const binary = probe.stdout.trim().split("\n")[0];
  if (!binary) throw new Error("Chrome binary not found");
  return binary;
}
class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url); this.nextId = 1; this.pending = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("CDP open failed")), { once: true });
    });
    this.ws.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const m = JSON.parse(raw); if (!m.id) return;
      const w = this.pending.get(m.id); if (!w) return; this.pending.delete(m.id);
      if (m.error) w.reject(new Error(w.method + ": " + m.error.message)); else w.resolve(m.result || {});
    });
  }
  async call(method, params = {}, sessionId) {
    await this.opened; const id = this.nextId++;
    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      const payload = { id, method, params }; if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
  async eval(sessionId, expression) {
    const r = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || "browser evaluation failed");
    return r.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}
async function waitDebugger(port) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch("http://127.0.0.1:" + port + "/json/version");
      if (r.ok) { const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; }
    } catch {}
    await sleep(100);
  }
  throw new Error("debugger unavailable");
}
async function waitFor(cdp, sessionId, expression, label, timeout = 30000) {
  const deadline = Date.now() + timeout; let last = null;
  while (Date.now() < deadline) {
    try { last = await cdp.eval(sessionId, expression); if (last) return last; }
    catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(100);
  }
  throw new Error(label + " timeout last=" + JSON.stringify(last));
}
async function boot(cdp, sessionId) {
  await waitFor(cdp, sessionId, 'document.readyState === "complete" && document.querySelector("#enter")?.disabled === false && typeof window.__sharedYardV0Evidence === "function"', "boot");
}
async function enter(cdp, sessionId, name) {
  await cdp.eval(sessionId, '(() => { const i=document.querySelector("#callsign"); i.value=' + JSON.stringify(name) + '; i.dispatchEvent(new Event("input",{bubbles:true})); document.querySelector("#enter").click(); return true; })()');
  await waitFor(cdp, sessionId, '(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.networkState?.startsWith("live") && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick > (e.protocolStartTick ?? 0) + 20; })()', "live");
}

const BASE = (process.env.MW_WORLD_V0_PRIVATE_REFRESH_BASE || "http://127.0.0.1:8787").replace(/\/$/,"");
const RUN = process.env.MW_WORLD_V0_PRIVATE_REFRESH_RUN || "owner-refresh-v28";
const URL = BASE + "/world-v0/?run=" + encodeURIComponent(RUN) + "&lifecycle=r0";
const OUTPUT = process.env.MW_WORLD_V0_PRIVATE_REFRESH_OUTPUT || "world-v0-private-refresh.json";
const PORT = 9901;
const profile = mkdtempSync(join(tmpdir(), "mw-private-refresh-"));
const chrome = findChrome();
const child = spawn(chrome, [
  "--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows","--disable-renderer-backgrounding",
  "--remote-debugging-port="+PORT,"--remote-debugging-address=127.0.0.1","--user-data-dir="+profile,"about:blank"
], { stdio:["ignore","ignore","pipe"] });
let cdp=null, sessionId=null, targetId=null;
const result={ verdict:"WORLD_V0_PRIVATE_REFRESH_CONTINUITY_FAIL", run:RUN, generatedAt:new Date().toISOString() };
try {
  cdp=new Cdp(await waitDebugger(PORT)); await cdp.opened;
  ({ targetId } = await cdp.call("Target.createTarget",{url:URL}));
  ({ sessionId } = await cdp.call("Target.attachToTarget",{targetId,flatten:true}));
  await cdp.call("Runtime.enable",{},sessionId); await cdp.call("Page.enable",{},sessionId);
  await boot(cdp,sessionId); await enter(cdp,sessionId,"RefreshOwner");
  const before=await cdp.eval(sessionId,"window.__sharedYardV0Evidence()");
  assert(before.lifecycle?.r0===true,"R0 not active");
  assert(before.lifecycle?.topology?.actors?.length===1,"initial topology not solo");
  const original={
    worldEpoch:before.identity.worldEpoch,
    actorSessionId:before.session.actorSessionId,
    netEntityId:before.session.selfNetEntityId,
    topologyRevision:before.lifecycle.topology.revision,
    boundary:before.localBoundaryTick
  };
  await cdp.call("Page.reload",{ignoreCache:true},sessionId);
  await boot(cdp,sessionId);
  const reloadedShell=await cdp.eval(sessionId,'({callsign:document.querySelector("#callsign").value, run:document.querySelector("#run").value, entry:window.__sharedYardV0FriendEntry?.()})');
  await cdp.eval(sessionId,'document.querySelector("#enter").click()');
  await waitFor(cdp,sessionId,'(() => { const e=window.__sharedYardV0Evidence?.(); return e && !e.runtimeFailed && e.networkState?.startsWith("live") && Number.isInteger(e.localBoundaryTick) && e.localBoundaryTick > '+original.boundary+'; })()',"post-refresh live",45000);
  const after=await cdp.eval(sessionId,"window.__sharedYardV0Evidence()");
  Object.assign(result,{original,reloadedShell,after:{
    worldEpoch:after.identity?.worldEpoch,
    actorSessionId:after.session?.actorSessionId,
    netEntityId:after.session?.selfNetEntityId,
    topologyRevision:after.lifecycle?.topology?.revision,
    actors:after.lifecycle?.topology?.actors,
    remotePresence:after.presentation?.remotePresence,
    guardMismatches:after.metrics?.guardMismatches,
    resumeEvents:(after.lifecycleEvents||[]).filter(e=>String(e.type).includes("resume"))
  }});
  assert(after.identity.worldEpoch===original.worldEpoch,"refresh rotated WorldEpoch");
  assert(after.session.actorSessionId===original.actorSessionId,"refresh created a new ActorSession");
  assert(after.session.selfNetEntityId===original.netEntityId,"refresh changed NetEntity");
  assert(after.lifecycle.topology.revision===original.topologyRevision,"refresh mutated topology revision");
  assert(after.lifecycle.topology.actors.length===1,"refresh left a shell actor in topology");
  assert(after.presentation.remotePresence===null,"refresh exposed old self as remote shell");
  assert(after.metrics.guardMismatches===0,"exact guard mismatch after refresh");
  result.verdict="WORLD_V0_PRIVATE_REFRESH_CONTINUITY_PASS";
  console.log(result.verdict,JSON.stringify(result));
} catch(error) {
  result.error=error instanceof Error ? error.stack||error.message : String(error);
  console.error(result.error); process.exitCode=1;
} finally {
  writeFileSync(OUTPUT,JSON.stringify(result,null,2));
  cdp?.close(); if(child.exitCode===null) child.kill("SIGKILL"); try{rmSync(profile,{recursive:true,force:true});}catch{}
}
