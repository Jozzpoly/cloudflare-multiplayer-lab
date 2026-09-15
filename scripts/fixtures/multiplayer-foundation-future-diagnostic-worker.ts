import baseHandler, {
  FoundationReplicationPhysicsTestWorld as BaseFoundationReplicationPhysicsTestWorld,
} from "../../src/multiplayer-foundation/replication-physics-test-worker.ts";
import { FoundationReplicationPhysicsRuntime } from "../../src/multiplayer-foundation/replication-physics-runtime.ts";

const FUTURE_STEPS = 60;
const FUTURE_PHASE_TICKS = 15;
const SECOND_FUTURE_STEPS = 120;
const FUTURE_PATTERNS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  "actor:0": [[0.6, -0.8], [-1, 0], [0, 1], [0.8, 0.6]],
  "actor:1": [[-0.6, -0.8], [1, 0], [0, -1], [-0.8, 0.6]],
  "actor:2": [[1, 0], [0, 1], [-1, 0], [0, -1]],
};
const SECOND_PATTERNS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  "actor:0": [[-0.8, 0.6], [0, -1], [1, 0], [-0.6, -0.8]],
  "actor:1": [[0.8, 0.6], [0, 1], [-1, 0], [0.6, -0.8]],
  "actor:2": [[-1, 0], [0, -1], [1, 0], [0, 1]],
};

type DiagnosticFuture = {
  revision: "multiplayer-foundation-future-equivalence-v2";
  sourceBoundaryTick: 63;
  futurePhysicsSteps: 60;
  sourceSeedBytes: number;
  sourceSeedFnv1a32: string;
  initialGuardPacked: string;
  futureGuardPacked: string;
  futureSeedBytes: number;
  futureSeedFnv1a32: string;
  secondInitialGuardPacked: string;
  secondFuturePhysicsSteps: 120;
  secondFutureGuardPacked: string;
  secondFutureSeedBytes: number;
  secondFutureSeedFnv1a32: string;
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
      const actorBindings = roster.actors.map((actor: any) => ({
        actorId: actor.actorId,
        actorSessionId: actor.actorSessionId,
      }));
      const sourceSeed = self.physics.captureSeed(body.worldEpoch, 63, topology);
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
      const secondFuture = FoundationReplicationPhysicsRuntime.fromSeed(futureSeed, actorBindings);
      const secondInitialGuardPacked = secondFuture.captureGuard(topology).packed;

      for (let step = 0; step < SECOND_FUTURE_STEPS; step += 1) {
        secondFuture.step(roster.actors.map((actor: any) => {
          if (step < 60) return { actorId: actor.actorId, x: 0, z: 0 };
          const phase = Math.floor((step - 60) / FUTURE_PHASE_TICKS);
          const vector = SECOND_PATTERNS[actor.actorId]?.[phase];
          if (!vector) throw new Error(`second future equivalence input missing ${actor.actorId}/${phase}`);
          return { actorId: actor.actorId, x: vector[0], z: vector[1] };
        }));
      }

      const secondFutureGuardPacked = secondFuture.captureGuard(topology).packed;
      const secondFutureSeed = secondFuture.captureSeed(body.worldEpoch, 243, topology);
      this.diagnosticFuture = {
        revision: "multiplayer-foundation-future-equivalence-v2",
        sourceBoundaryTick: 63,
        futurePhysicsSteps: 60,
        sourceSeedBytes: sourceSeed.byteLength,
        sourceSeedFnv1a32: sourceSeed.fnv1a32,
        initialGuardPacked,
        futureGuardPacked,
        futureSeedBytes: futureSeed.byteLength,
        futureSeedFnv1a32: futureSeed.fnv1a32,
        secondInitialGuardPacked,
        secondFuturePhysicsSteps: 120,
        secondFutureGuardPacked,
        secondFutureSeedBytes: secondFutureSeed.byteLength,
        secondFutureSeedFnv1a32: secondFutureSeed.fnv1a32,
      };
    }

    return new Response(JSON.stringify({ ...body, diagnosticFuture: this.diagnosticFuture }), {
      status: response.status,
      headers: response.headers,
    });
  }
}

export default baseHandler;
