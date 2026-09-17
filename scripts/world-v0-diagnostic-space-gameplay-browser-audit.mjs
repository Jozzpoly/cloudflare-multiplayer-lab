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

const BASE = (process.env.MW_WORLD_V0_DIAGNOSTIC_SPACE_BASE || "http://127.0.0.1:8787").replace(/\/$/,"");
const RUN = process.env.MW_WORLD_V0_DIAGNOSTIC_SPACE_RUN || "diag-space-v28";
const URL = BASE + "/world-v0/?run=" + encodeURIComponent(RUN) + "&lifecycle=r0";
const OUTPUT = process.env.MW_WORLD_V0_DIAGNOSTIC_SPACE_OUTPUT || "world-v0-diagnostic-space.json";
const PORT = 9902;
const profile = mkdtempSync(join(tmpdir(), "mw-diagnostic-space-"));
const chrome = findChrome();
const child = spawn(chrome, [
  "--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows","--disable-renderer-backgrounding",
  "--remote-debugging-port="+PORT,"--remote-debugging-address=127.0.0.1","--user-data-dir="+profile,"about:blank"
], { stdio:["ignore","ignore","pipe"] });
let cdp=null, sessionId=null;
const result={ verdict:"WORLD_V0_DIAGNOSTIC_SPACE_GAMEPLAY_FAIL", run:RUN, generatedAt:new Date().toISOString() };
try {
  cdp=new Cdp(await waitDebugger(PORT)); await cdp.opened;
  const created=await cdp.call("Target.createTarget",{url:URL});
  ({ sessionId } = await cdp.call("Target.attachToTarget",{targetId:created.targetId,flatten:true}));
  await cdp.call("Runtime.enable",{},sessionId); await cdp.call("Page.enable",{},sessionId);
  await boot(cdp,sessionId); await enter(cdp,sessionId,"DiagOwner");
  const box=await cdp.eval(sessionId,'(() => { const s=document.querySelector("#hud summary"); const r=s.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()');
  await cdp.call("Input.dispatchMouseEvent",{type:"mousePressed",x:box.x,y:box.y,button:"left",clickCount:1},sessionId);
  await cdp.call("Input.dispatchMouseEvent",{type:"mouseReleased",x:box.x,y:box.y,button:"left",clickCount:1},sessionId);
  await sleep(100);
  const before=await cdp.eval(sessionId,'(() => { const e=window.__sharedYardV0Evidence(); return {open:document.querySelector("#hud").open,active:document.activeElement?.tagName,pressSequence:e.inputScheduler.jumpDelivery.pressSequence,applied:e.inputScheduler.jumpDelivery.appliedCount}; })()');
  assert(before.open===true,"mouse click did not open Diagnostics");
  await cdp.call("Input.dispatchKeyEvent",{type:"keyDown",key:" ",code:"Space",windowsVirtualKeyCode:32,nativeVirtualKeyCode:32},sessionId);
  await sleep(40);
  await cdp.call("Input.dispatchKeyEvent",{type:"keyUp",key:" ",code:"Space",windowsVirtualKeyCode:32,nativeVirtualKeyCode:32},sessionId);
  await sleep(250);
  const after=await cdp.eval(sessionId,'(() => { const e=window.__sharedYardV0Evidence(); return {open:document.querySelector("#hud").open,active:document.activeElement?.tagName,pressSequence:e.inputScheduler.jumpDelivery.pressSequence,delivered:e.inputScheduler.jumpDelivery.deliveredSequence,raw:e.presentation.rawInput}; })()');
  Object.assign(result,{before,after});
  assert(after.open===true,"Space toggled Diagnostics instead of remaining gameplay-owned");
  assert(after.pressSequence===before.pressSequence+1,"Space did not create a gameplay jump press");
  result.verdict="WORLD_V0_DIAGNOSTIC_SPACE_GAMEPLAY_PASS";
  console.log(result.verdict,JSON.stringify(result));
} catch(error) {
  result.error=error instanceof Error ? error.stack||error.message : String(error);
  console.error(result.error); process.exitCode=1;
} finally {
  writeFileSync(OUTPUT,JSON.stringify(result,null,2));
  cdp?.close(); if(child.exitCode===null) child.kill("SIGKILL"); try{rmSync(profile,{recursive:true,force:true});}catch{}
}
