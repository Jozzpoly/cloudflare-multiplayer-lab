import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`${label}: anchor missing`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: anchor not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

// Client: preserve the full early lifecycle and force the exact no-WebGL-draw
// cadence that exposed the lead2 startup failure. This is observability-only.
{
  const path = "public/world-v0/app.js";
  let source = readFileSync(path, "utf8");
  source = replaceOnce(source, "const LIFECYCLE_RETAIN = 32;", "const LIFECYCLE_RETAIN = 128;", "lifecycle retain");
  source = replaceOnce(
    source,
    "  renderer.render(scene, camera);",
    "  // PRESTART_FORENSICS: preserve rAF/sync cadence but skip WebGL draw.\n  if (!window.__mwLead2PrestartForensicsNoDraw) renderer.render(scene, camera);",
    "forensics render gate",
  );
  source = replaceOnce(
    source,
    "window.__sharedYardV0Evidence = buildEvidence;",
    "window.__mwLead2PrestartForensicsNoDraw = true;\nwindow.__sharedYardV0Evidence = buildEvidence;",
    "forensics no-draw default",
  );
  writeFileSync(path, source);
}

// Durable Object: retain resume-handshake diagnostics without changing the
// underlying acceptance contract. A seed exception would already abort the
// websocket upgrade; this wrapper merely records and names it.
{
  const path = "src/world-v0-shared-yard.ts";
  let source = readFileSync(path, "utf8");
  source = replaceOnce(
    source,
    "  private resetting = false;\n  private supportContacts:",
    `  private resetting = false;
  private resumeForensics = {
    requests: 0,
    seedAttempts: 0,
    seedSuccesses: 0,
    lastRequestTick: null as number | null,
    lastSeedSuccessTick: null as number | null,
    lastFailure: null as null | { at: string; tick: number; message: string },
  };
  private supportContacts:`,
    "resume forensic state",
  );
  source = replaceOnce(
    source,
    "        failure: this.failure,\n      });",
    "        failure: this.failure,\n        resumeForensics: { ...this.resumeForensics },\n      });",
    "status resume forensics",
  );
  source = replaceOnce(
    source,
    "    if (requestedResumeToken) {\n      if (!this.world || !this.worldId || !this.worldEpoch) {",
    `    if (requestedResumeToken) {
      this.resumeForensics.requests += 1;
      this.resumeForensics.lastRequestTick = this.tick;
      if (!this.world || !this.worldId || !this.worldEpoch) {`,
    "resume request accounting",
  );
  source = replaceOnce(
    source,
    `    const rebaseSeed = resumed && this.protocolStartTick !== null
      ? this.createAuthorityRebaseSeed()
      : null;`,
    `    let rebaseSeed = null;
    if (resumed && this.protocolStartTick !== null) {
      this.resumeForensics.seedAttempts += 1;
      try {
        rebaseSeed = this.createAuthorityRebaseSeed();
        this.resumeForensics.seedSuccesses += 1;
        this.resumeForensics.lastSeedSuccessTick = this.tick;
        this.resumeForensics.lastFailure = null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.resumeForensics.lastFailure = { at: new Date().toISOString(), tick: this.tick, message };
        return json({
          ok: false,
          error: "resume_rebase_seed_failed",
          detail: message,
          boundaryTick: this.tick,
          protocolStartTick: this.protocolStartTick,
          resumeForensics: { ...this.resumeForensics },
        }, 500);
      }
    }`,
    "resume seed diagnostic wrapper",
  );
  writeFileSync(path, source);
}

// Isolated-worker-only debug route: expose the DO's existing non-websocket status
// response for a specific run key. No route is materialized into the candidate.
{
  const path = "src/world-slice-entry.ts";
  let source = readFileSync(path, "utf8");
  source = replaceOnce(
    source,
    "async function sharedYardV0PublicRoomDirectoryResponse(env: Env): Promise<Response> {",
    `async function sharedYardV0ForensicsStatusResponse(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const run = (url.searchParams.get("run") ?? "manual").trim();
  const safeRun = /^[A-Za-z0-9_-]{1,20}$/.test(run) ? run : "manual";
  const stub = sharedYardV0Stub(env, \`shared-yard-v0-\${safeRun}\`);
  return stub.fetch(new Request(\`https://world-v0.internal/forensics/\${safeRun}\`));
}

async function sharedYardV0PublicRoomDirectoryResponse(env: Env): Promise<Response> {`,
    "forensics status helper",
  );
  source = replaceOnce(
    source,
    "    if (url.pathname === \"/api/world-v0/rooms\" && env.SHARED_YARD_V0) return sharedYardV0PublicRoomDirectoryResponse(env);",
    "    if (url.pathname === \"/api/world-v0/rooms\" && env.SHARED_YARD_V0) return sharedYardV0PublicRoomDirectoryResponse(env);\n    if (url.pathname === \"/api/world-v0/forensics\" && env.SHARED_YARD_V0) return sharedYardV0ForensicsStatusResponse(request, env);",
    "forensics status route",
  );
  writeFileSync(path, source);
}

console.log("WORLD_V0_LEAD2_PRESTART_FORENSICS_INSTRUMENTATION_APPLIED");
