type AssetBinding = {
  fetch(request: Request): Promise<Response>;
};

interface Env {
  ASSETS: AssetBinding;
}

const jsonHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/ping") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "cloudflare-multiplayer-lab",
          stage: "gate-1-deployment-sanity",
          timestamp: new Date().toISOString(),
        }),
        { headers: jsonHeaders },
      );
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
