from pathlib import Path
import subprocess


def replace_once(text: str, before: str, after: str, label: str) -> str:
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: expected one marker, got {count}")
    return text.replace(before, after)


contract_path = Path("src/world-v0-contract.ts")
contract = contract_path.read_text()
contract = replace_once(
    contract,
    'export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v11-prestart-ambiguity-grace";\nexport const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v8-prestart-ambiguity-grace";',
    'export const WORLD_V0_CONTRACT_REVISION = "shared-yard-v0-contract-v12-prestart-live-start-gate";\nexport const WORLD_V0_SERVER_REVISION = "shared-yard-v0-authority-v9-prestart-live-start-gate";',
    "revision",
)
contract_path.write_text(contract)

server_path = Path("src/world-v0-shared-yard.ts")
server = server_path.read_text()
server = replace_once(
    server,
    """  private maybeStartProtocol(): void {
    if (this.protocolStartTick !== null || this.players.size !== MAX_PLAYERS) return;
    if ([...this.players.values()].some((player) => !player.ready)) return;
""",
    """  private maybeStartProtocol(): void {
    if (this.protocolStartTick !== null || this.players.size !== MAX_PLAYERS) return;
    if (this.connectedPlayerCount() !== MAX_PLAYERS) return;
    if ([...this.players.values()].some((player) => !player.ready)) return;
""",
    "live-start-gate",
)
server_path.write_text(server)

sim_build_id = subprocess.check_output(
    [
        "node",
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        'import("./src/world-v0-contract.ts").then((m) => console.log(m.WORLD_V0_SIM_BUILD_ID))',
    ],
    text=True,
).strip().splitlines()[-1]

build_path = Path("public/world-v0/build-contract.js")
build = build_path.read_text()
for before, after, label in [
    ("shared-yard-v0-browser-ui-v14-prestart-ambiguity-grace", "shared-yard-v0-browser-ui-v15-prestart-live-start-gate", "ui-revision"),
    ("shared-yard-v0-authority-v8-prestart-ambiguity-grace", "shared-yard-v0-authority-v9-prestart-live-start-gate", "server-revision"),
    ("shared-yard-v0-sim-76352637009935db", sim_build_id, "sim-build"),
]:
    build = replace_once(build, before, after, label)
build_path.write_text(build)

print("WORLD_V0_PRESTART_LIVE_START_GATE_CANDIDATE", sim_build_id)
