import { DurableObject } from "cloudflare:workers";
import {
  decodeFoundationReplicationProgressOverlay,
  type FoundationReplicationProgressOverlay,
} from "./replication-progress-overlay.ts";
import { FoundationReplicationProgressSqliteStorage } from "./replication-progress-sqlite-storage.ts";

interface ProgressStorageTestEnv {
  FOUNDATION_PROGRESS_TEST: DurableObjectNamespace<FoundationProgressStorageTest>;
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function positiveIntegerParam(url: URL, name: string): number {
  const value = Number(url.searchParams.get(name));
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`invalid_${name}`);
  return value;
}

export class FoundationProgressStorageTest extends DurableObject<ProgressStorageTestEnv> {
  private readonly progress: FoundationReplicationProgressSqliteStorage;
  private readonly instanceNonce = crypto.randomUUID();

  constructor(ctx: DurableObjectState, env: ProgressStorageTestEnv) {
    super(ctx, env);
    this.progress = new FoundationReplicationProgressSqliteStorage(ctx.storage);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/write") {
        if (request.method !== "POST") return json({ ok: false, error: "post_required" }, 405);
        const bytes = new Uint8Array(await request.arrayBuffer());
        const overlay = decodeFoundationReplicationProgressOverlay(bytes);
        const started = performance.now();
        const result = this.progress.write(overlay);
        const writeMs = performance.now() - started;
        return json({
          ok: true,
          instanceNonce: this.instanceNonce,
          result,
          stateDigest: overlay.stateDigest,
          writeMs,
          stats: this.progress.stats(),
        });
      }

      if (url.pathname === "/read") {
        const overlay = this.progress.read();
        return json({
          ok: true,
          instanceNonce: this.instanceNonce,
          overlay,
          stats: this.progress.stats(),
        });
      }

      if (url.pathname === "/read-for-base") {
        const baseGeneration = positiveIntegerParam(url, "generation");
        const overlay = this.progress.readForBase(baseGeneration);
        return json({
          ok: true,
          instanceNonce: this.instanceNonce,
          overlay,
          stats: this.progress.stats(),
        });
      }

      if (url.pathname === "/health") {
        return json({ ok: true, instanceNonce: this.instanceNonce, stats: this.progress.stats() });
      }

      return json({ ok: false, error: "not_found" }, 404);
    } catch (error) {
      return json({
        ok: false,
        instanceNonce: this.instanceNonce,
        error: error instanceof Error ? error.message : String(error),
        stats: this.progress.stats(),
      }, 409);
    }
  }
}

export default {
  async fetch(request: Request, env: ProgressStorageTestEnv): Promise<Response> {
    const url = new URL(request.url);
    const objectName = url.searchParams.get("object") ?? "progress-overlay-probe";
    const stub = env.FOUNDATION_PROGRESS_TEST.get(env.FOUNDATION_PROGRESS_TEST.idFromName(objectName));
    return stub.fetch(request);
  },
} satisfies ExportedHandler<ProgressStorageTestEnv>;
