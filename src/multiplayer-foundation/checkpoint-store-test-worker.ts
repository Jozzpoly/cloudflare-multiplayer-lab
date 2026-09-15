import { DurableObject } from "cloudflare:workers";
import { publishFoundationCheckpoint, recoverFoundationCheckpoint } from "./checkpoint-store";
import { FoundationCheckpointSqliteStorage } from "./checkpoint-sqlite-storage";

const WORLD_EPOCH = "gate-4c-sqlite-test-epoch";
const DEFAULT_CHUNK_BYTES = 32 * 1024;
const MAX_TEST_PAYLOAD_BYTES = 1024 * 1024;

interface CheckpointTestEnv {
  FOUNDATION_CHECKPOINT_TEST: DurableObjectNamespace<FoundationCheckpointTest>;
}

function deterministicPayload(seed: number, byteLength: number): Uint8Array {
  let state = seed >>> 0;
  const bytes = new Uint8Array(byteLength);
  for (let index = 0; index < byteLength; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

function integerParam(url: URL, name: string, minimum: number, maximum: number): number {
  const raw = url.searchParams.get(name);
  const value = raw === null ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`invalid_${name}`);
  }
  return value;
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export class FoundationCheckpointTest extends DurableObject<CheckpointTestEnv> {
  private readonly checkpointStorage: FoundationCheckpointSqliteStorage;
  private readonly instanceNonce = crypto.randomUUID();

  constructor(ctx: DurableObjectState, env: CheckpointTestEnv) {
    super(ctx, env);
    this.checkpointStorage = new FoundationCheckpointSqliteStorage(ctx.storage);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/publish") {
        const generation = integerParam(url, "generation", 0, Number.MAX_SAFE_INTEGER);
        const canonicalTick = integerParam(url, "tick", 0, Number.MAX_SAFE_INTEGER);
        const seed = integerParam(url, "seed", 0, 0xffffffff);
        const byteLength = integerParam(url, "bytes", 1, MAX_TEST_PAYLOAD_BYTES);
        const chunkBytes = url.searchParams.has("chunk")
          ? integerParam(url, "chunk", 1, MAX_TEST_PAYLOAD_BYTES)
          : DEFAULT_CHUNK_BYTES;
        const payload = deterministicPayload(seed, byteLength);
        const head = await publishFoundationCheckpoint(this.checkpointStorage, {
          generation,
          worldEpoch: WORLD_EPOCH,
          canonicalTick,
          payload,
          chunkBytes,
        });
        const recovered = await recoverFoundationCheckpoint(this.checkpointStorage);
        if (!recovered) throw new Error("checkpoint_missing_immediately_after_publish");
        return json({
          ok: true,
          instanceNonce: this.instanceNonce,
          head,
          payloadSha256: recovered.manifest.payloadSha256,
          payloadByteLength: recovered.payload.byteLength,
          stats: this.checkpointStorage.stats(),
        });
      }

      if (url.pathname === "/publish-bytes") {
        if (request.method !== "POST") return json({ ok: false, error: "post_required" }, 405);
        const generation = integerParam(url, "generation", 0, Number.MAX_SAFE_INTEGER);
        const canonicalTick = integerParam(url, "tick", 0, Number.MAX_SAFE_INTEGER);
        const chunkBytes = url.searchParams.has("chunk")
          ? integerParam(url, "chunk", 1, MAX_TEST_PAYLOAD_BYTES)
          : DEFAULT_CHUNK_BYTES;
        const payload = new Uint8Array(await request.arrayBuffer());
        if (payload.byteLength <= 0 || payload.byteLength > MAX_TEST_PAYLOAD_BYTES) {
          throw new Error("invalid_payload_byte_length");
        }
        const head = await publishFoundationCheckpoint(this.checkpointStorage, {
          generation,
          worldEpoch: WORLD_EPOCH,
          canonicalTick,
          payload,
          chunkBytes,
        });
        const recovered = await recoverFoundationCheckpoint(this.checkpointStorage);
        if (!recovered) throw new Error("checkpoint_missing_immediately_after_publish");
        return json({
          ok: true,
          instanceNonce: this.instanceNonce,
          head,
          payloadSha256: recovered.manifest.payloadSha256,
          payloadByteLength: recovered.payload.byteLength,
          chunkCount: recovered.manifest.chunks.length,
          stats: this.checkpointStorage.stats(),
        });
      }

      if (url.pathname === "/recover") {
        const recovered = await recoverFoundationCheckpoint(this.checkpointStorage);
        return json({
          ok: true,
          instanceNonce: this.instanceNonce,
          recovered: recovered
            ? {
                generation: recovered.head.generation,
                canonicalTick: recovered.head.canonicalTick,
                worldEpoch: recovered.head.worldEpoch,
                payloadSha256: recovered.manifest.payloadSha256,
                payloadByteLength: recovered.payload.byteLength,
                chunkCount: recovered.manifest.chunks.length,
              }
            : null,
          stats: this.checkpointStorage.stats(),
        });
      }

      if (url.pathname === "/recover-bytes") {
        const recovered = await recoverFoundationCheckpoint(this.checkpointStorage);
        if (!recovered) return json({ ok: false, error: "checkpoint_not_found" }, 404);
        return new Response(ownedArrayBuffer(recovered.payload), {
          status: 200,
          headers: {
            "cache-control": "no-store",
            "content-type": "application/octet-stream",
            "x-foundation-generation": String(recovered.head.generation),
            "x-foundation-canonical-tick": String(recovered.head.canonicalTick),
            "x-foundation-payload-sha256": recovered.manifest.payloadSha256,
            "x-foundation-instance-nonce": this.instanceNonce,
          },
        });
      }

      if (url.pathname === "/health") {
        return json({ ok: true, instanceNonce: this.instanceNonce, stats: this.checkpointStorage.stats() });
      }

      return json({ ok: false, error: "not_found" }, 404);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : String(error), instanceNonce: this.instanceNonce }, 409);
    }
  }
}

export default {
  async fetch(request: Request, env: CheckpointTestEnv): Promise<Response> {
    const url = new URL(request.url);
    const objectName = url.searchParams.get("object") ?? "checkpoint-store-probe";
    const stub = env.FOUNDATION_CHECKPOINT_TEST.get(env.FOUNDATION_CHECKPOINT_TEST.idFromName(objectName));
    return stub.fetch(request);
  },
} satisfies ExportedHandler<CheckpointTestEnv>;
