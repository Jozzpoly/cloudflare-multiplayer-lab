import {
  WORLD_V0_PLAYER_ID_PATTERN,
  normalizeWorldV0HumanName,
  worldV0HumanNameMessage,
} from "../public/world-v0/human-entry-core.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const cases = [
  ["Jozz", "Jozz"],
  ["Józz :D", "Jozz-D"],
  ["Ktoś testowy", "Ktos-testowy"],
  ["Łukasz", "Lukasz"],
  ["  owner one  ", "owner-one"],
  ["a___b", "a-b"],
  ["abcdefghijklmnopqrstuvwxYZ", "abcdefghijklmnopqrstuvwx"],
];

for (const [input, expected] of cases) {
  const result = normalizeWorldV0HumanName(input);
  assert(result.wireName === expected, `${JSON.stringify(input)} -> ${result.wireName}, expected ${expected}`);
  assert(result.valid === true, `${JSON.stringify(input)} should normalize to valid wire name`);
  assert(WORLD_V0_PLAYER_ID_PATTERN.test(result.wireName), `${result.wireName} violates server playerId contract`);
}

for (const input of ["", "   ", "😀", "---", "___"]) {
  const result = normalizeWorldV0HumanName(input);
  assert(result.valid === false, `${JSON.stringify(input)} unexpectedly became valid ${result.wireName}`);
  assert(worldV0HumanNameMessage(result).includes("at least one letter or number"), `missing useful invalid-name guidance for ${JSON.stringify(input)}`);
}

const adjusted = normalizeWorldV0HumanName("Józz :D");
assert(worldV0HumanNameMessage(adjusted) === "Network name: Jozz-D", "adjusted-name message drift");

console.log("WORLD_V0_HUMAN_ENTRY_CORE_PASS", JSON.stringify({ cases: cases.length, invalidCases: 5 }));
