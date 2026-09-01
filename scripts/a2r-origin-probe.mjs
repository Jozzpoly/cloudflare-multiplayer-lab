const ORIGINS = [
  { name: "production", url: "https://cloudflare-multiplayer-lab.jozzpoly.workers.dev" },
  { name: "staging", url: "https://cloudflare-multiplayer-lab-staging.jozzpoly.workers.dev" },
];

const PATHS = ["/api/ping", "/world0/app.js", "/world0-a2r/app.js"];

function extractClientRevision(text) {
  return /CLIENT_REVISION\s*=\s*["'`]([^"'`]+)["'`]/.exec(text)?.[1] ?? null;
}

async function probe(origin, path) {
  const url = `${origin.url}${path}`;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    const text = await response.text();
    const result = {
      path,
      status: response.status,
      ok: response.ok,
      location: response.headers.get("location"),
      contentType: response.headers.get("content-type"),
      bytes: text.length,
    };
    if (path.endsWith(".js")) result.clientRevision = extractClientRevision(text);
    if (path === "/api/ping") {
      try {
        const json = JSON.parse(text);
        result.ping = {
          ok: json?.ok ?? null,
          revision: json?.revision ?? null,
          stage: json?.stage ?? null,
        };
      } catch {
        result.ping = null;
      }
    }
    return result;
  } catch (error) {
    return {
      path,
      status: null,
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

console.log("A2R public origin safety probe — diagnostic only");
for (const origin of ORIGINS) {
  const results = [];
  for (const path of PATHS) results.push(await probe(origin, path));
  console.log(`${origin.name} ${origin.url}`);
  console.log(JSON.stringify(results, null, 2));
}
