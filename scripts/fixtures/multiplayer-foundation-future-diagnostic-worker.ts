import baseHandler, {
  FoundationReplicationPhysicsTestWorld as BaseFoundationReplicationPhysicsTestWorld,
} from "../../src/multiplayer-foundation/replication-physics-test-worker.ts";
import { FoundationReplicationPhysicsRuntime } from "../../src/multiplayer-foundation/replication-physics-runtime.ts";

const FUTURE_STEPS = 60;
const FUTURE_PHASE_TICKS = 15;
const FUTURE_PATTERNS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  "actor:0": [[0.6, -0.8], [-1, 0], [0, 1], [0.8, 0.6]],
  "actor:1": [[-0.6, -0.8], [1, 0], [0, -1], [-0.8, 0.6]],
  "actor:2": [[1, 0], [0, 1], [-1, 0], [0, -1]],
};

type DiagnosticFuture = {
  revision: "multiplayer-foundation-future-equivalence-v1";
  sourceBoundaryTick: 63;
  futurePhysicsSteps: 60;
  sourceSeedBytes: number;
  sourceSeedFnv1a32: string;
  initialGuardPacked: string;
  futureGuardPacked: string;
  futureSeedBytes: number;
  futureSeedFnv1a32: string;
};

export class FoundationReplicationPhysicsTestWorld extends BaseFoundationReplicationPhysicsTestWorld {
  private diagnosticFuture: DiagnosticFuture | null = null;

  override async fetch(request: Request): Promise<Response> {
    const response = await super.fetch(request);
    const url = new URL(request.url);
    if (
      request.headers.get("Upgrade")?.toLowerCase() === "websocket"
      || url.pathname !== "/foundation-physics/status"
      || response.status !== 200
    ) return response;

    const body = await response.clone().json() as Record<string, any>;
    if (
      body.boundaryTick !== 63
      || body.continuationTicks !== 60
      || typeof body.finalGuardPacked !== "string"
      || body.finalGuardPacked.length === 0
    ) return response;

    if (this.diagnosticFuture === null) {
      const self = this as any;
      const roster = self.roster.snapshot();
      const topology = self.topology.snapshot();
      const sourceSeed = self.physics.captureSeed(body.worldEpoch, 63, topology);
      const actorBindings = roster.actors.map((actor: any) => ({
        actorId: actor.actorId,
        actorSessionId: actor.actorSessionId,
      }));
      const future = FoundationReplicationPhysicsRuntime.fromSeed(sourceSeed, actorBindings);
      const initialGuardPacked = future.captureGuard(topology).packed;

      for (let step = 0; step < FUTURE_STEPS; step += 1) {
        const phase = Math.floor(step / FUTURE_PHASE_TICKS);
        future.step(roster.actors.map((actor: any) => {
          const vector = FUTURE_PATTERNS[actor.actorId]?.[phase];
          if (!vector) throw new Error(`future equivalence input missing ${actor.actorId}/${phase}`);
          return { actorId: actor.actorId, x: vector[0], z: vector[1] };
        }));
      }

      const futureGuardPacked = future.captureGuard(topology).packed;
      const futureSeed = future.captureSeed(body.worldEpoch, 123, topology);
      this.diagnosticFuture = {
        revision: "multiplayer-foundation-future-equivalence-v1",
        sourceBoundaryTick: 63,
        futurePhysicsSteps: 60,
        sourceSeedBytes: sourceSeed.byteLength,
        sourceSeedFnv1a32: sourceSeed.fnv1a32,
        initialGuardPacked,
        futureGuardPacked,
        futureSeedBytes: futureSeed.byteLength,
        futureSeedFnv1a32: futureSeed.fnv1a32,
      };
    }

    return new Response(JSON.stringify({ ...body, diagnosticFuture: this.diagnosticFuture }), {
      status: response.status,
      headers: response.headers,
    });
  }
}

export default baseHandler;
