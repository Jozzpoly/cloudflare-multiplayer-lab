import baseWorker, { FoundationAuthorityConstructorTest } from "./multiplayer-foundation-authority-constructor-worker.mjs";
import {
  FOUNDATION_RECOVERY_REMOTE_BUILD_ID,
  FOUNDATION_RECOVERY_REMOTE_TRIGGER,
} from "./foundation-recovery-remote-build.generated.mjs";

export { FoundationAuthorityConstructorTest };

const ALLOWED = {
  seed: new Map([
    ["/health", "GET"],
    ["/publish-envelope", "POST"],
  ]),
  resume: new Map([
    ["/health", "GET"],
    ["/resume", "POST"],
  ]),
};

function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/build") {
      return json({
        ok: true,
        buildId: FOUNDATION_RECOVERY_REMOTE_BUILD_ID,
        triggerRevision: FOUNDATION_RECOVERY_REMOTE_TRIGGER.revision,
        phase: FOUNDATION_RECOVERY_REMOTE_TRIGGER.phase,
        campaignId: FOUNDATION_RECOVERY_REMOTE_TRIGGER.campaignId,
        adapter: {
          box3dJsCommit: "5d5a3af049cccd9948b2b55bac4342414af0ef64",
          box3dCommit: "8441b4a06d6d09dcfb0b0f704df4d847d1437b92",
          emscriptenVersion: "6.0.2",
          profile: "static-wasm-csp-safe-byte-bridge-v1",
        },
      });
    }

    const phase = FOUNDATION_RECOVERY_REMOTE_TRIGGER.phase;
    const allowed = ALLOWED[phase];
    if (!allowed) return json({ ok: false, error: "remote_recovery_not_armed" }, 404);

    const campaign = url.searchParams.get("campaign");
    if (campaign !== FOUNDATION_RECOVERY_REMOTE_TRIGGER.campaignId) {
      return json({ ok: false, error: "campaign_mismatch" }, 404);
    }

    const requiredMethod = allowed.get(url.pathname);
    if (!requiredMethod) return json({ ok: false, error: "endpoint_not_available_in_phase" }, 404);
    if (request.method !== requiredMethod) return json({ ok: false, error: "method_not_allowed" }, 405);

    url.searchParams.set("object", `foundation-recovery-${FOUNDATION_RECOVERY_REMOTE_TRIGGER.campaignId}`);
    const forwarded = new Request(url, request);
    return baseWorker.fetch(forwarded, env, ctx);
  },
};
