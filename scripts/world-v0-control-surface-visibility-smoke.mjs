import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../public/world-v0/control-surface-visibility.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/world-v0/index.html", import.meta.url), "utf8");

assert.match(html, /control-surface-visibility\.css/, "World V0 must load pointer-aware control visibility CSS");
assert.match(css, /#joystick,[\s\S]*#camera-gimbal,[\s\S]*#jump-button\s*\{[\s\S]*display:\s*none\s*!important/, "touch gameplay controls must default hidden");
assert.match(css, /@media\s*\(pointer:\s*coarse\)[\s\S]*#joystick,[\s\S]*#camera-gimbal\s*\{[\s\S]*display:\s*block\s*!important/, "coarse-pointer devices must recover joystick and gimbal");
assert.match(css, /#jump-button:not\(\.hidden\)\s*\{[\s\S]*display:\s*block\s*!important/, "coarse-pointer active jump must remain visible");

console.log("WORLD_V0_CONTROL_SURFACE_VISIBILITY_PASS");
