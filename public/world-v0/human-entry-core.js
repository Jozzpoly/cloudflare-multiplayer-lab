export const WORLD_V0_HUMAN_ENTRY_REVISION = "world-v0-human-entry-v1";
export const WORLD_V0_PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;

const POLISH_FOLD = new Map([
  ["Ł", "L"],
  ["ł", "l"],
]);

export function normalizeWorldV0HumanName(raw) {
  const source = String(raw ?? "").trim();
  let folded = "";
  for (const char of source.normalize("NFKD")) folded += POLISH_FOLD.get(char) ?? char;
  const withoutMarks = folded.replace(/[\u0300-\u036f]/g, "");
  const wireName = withoutMarks
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 24);
  return {
    source,
    wireName,
    changed: wireName !== source,
    valid: WORLD_V0_PLAYER_ID_PATTERN.test(wireName),
  };
}

export function worldV0HumanNameMessage(result) {
  if (!result?.valid) return "Enter a name containing at least one letter or number.";
  if (result.changed) return `Network name: ${result.wireName}`;
  return "Spaces and Polish letters are accepted and adapted automatically.";
}
