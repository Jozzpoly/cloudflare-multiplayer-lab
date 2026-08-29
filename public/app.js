const button = document.querySelector("#ping");
const status = document.querySelector("#status");
const result = document.querySelector("#result");

if (!(button instanceof HTMLButtonElement) || !(status instanceof HTMLElement) || !(result instanceof HTMLElement)) {
  throw new Error("Gate 1 UI is missing required elements.");
}

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Contacting Worker…";
  result.textContent = "GET /api/ping";

  try {
    const response = await fetch("/api/ping", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok || payload.ok !== true) {
      throw new Error(`Worker returned HTTP ${response.status}`);
    }

    status.textContent = "Worker reachable. Gate 1 runtime path is alive.";
    result.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    status.textContent = "Worker check failed.";
    result.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    button.disabled = false;
  }
});
