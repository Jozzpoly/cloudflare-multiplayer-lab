import {
  advanceReactor,
  resolveReactorBounds,
  solveReactorContacts,
  type ReactorContactBody,
  type ReactorContactResult,
  type ReactorPhysicsConfig,
  type ReactorState,
} from "../src/reactor-physics.js";

const CONFIG: ReactorPhysicsConfig = {
  reactorMass: 4,
  restitution: 0.2,
  wallRestitution: 0.72,
  drag: 0.85,
  maxSpeed: 520,
  positionSlop: 0.5,
  positionCorrection: 0.8,
  correctionPasses: 2,
};

const REACTOR: ReactorState = {
  x: 800,
  y: 500,
  vx: 0,
  vy: 0,
  radius: 46,
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertFinite(value: number, message: string): void {
  assert(Number.isFinite(value), `${message}: expected finite, got ${value}`);
}

function assertFiniteResult(result: ReactorContactResult, message: string): void {
  for (const [name, value] of Object.entries(result.reactor)) {
    assertFinite(value, `${message}:reactor.${name}`);
  }
  for (const body of result.bodies) {
    for (const key of ["x", "y", "vx", "vy", "radius", "mass"] as const) {
      assertFinite(body[key], `${message}:${body.id}.${key}`);
    }
  }
  for (const contact of result.contacts) {
    assertFinite(contact.impulseMagnitude, `${message}:${contact.id}.impulse`);
  }
}

function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalNumbers(result: ReactorContactResult): number[] {
  const values = [
    result.reactor.x,
    result.reactor.y,
    result.reactor.vx,
    result.reactor.vy,
    result.reactor.radius,
  ];
  for (const body of [...result.bodies].sort((a, b) => compareId(a.id, b.id))) {
    values.push(body.x, body.y, body.vx, body.vy, body.radius, body.mass);
  }
  for (const contact of [...result.contacts].sort((a, b) => compareId(a.id, b.id))) {
    values.push(contact.impulseMagnitude);
  }
  return values;
}

function assertResultApprox(
  actual: ReactorContactResult,
  expected: ReactorContactResult,
  tolerance: number,
  message: string,
): void {
  const a = canonicalNumbers(actual);
  const b = canonicalNumbers(expected);
  assert(a.length === b.length, `${message}: canonical length mismatch`);
  for (let index = 0; index < a.length; index += 1) {
    assertApprox(a[index], b[index], tolerance, `${message}[${index}]`);
  }
}

function body(
  id: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius = 18,
  mass = 1,
): ReactorContactBody {
  return { id, x, y, vx, vy, radius, mass };
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += 1) {
    const head = items[index];
    const tail = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const rest of permutations(tail)) result.push([head, ...rest]);
  }
  return result;
}

function runFreeIntegration(): ReactorState {
  let state: ReactorState = { ...REACTOR, vx: 300, vy: -120 };
  for (let step = 0; step < 20; step += 1) state = advanceReactor(state, 0.05, CONFIG);
  return state;
}

function runMultiStepScenario(): ReactorContactResult {
  let reactor: ReactorState = { ...REACTOR, vx: 35, vy: -20 };
  let bodies = [
    body("A", 742, 500, 210, 10),
    body("B", 858, 505, -165, -5),
    body("C", 800, 441, 5, 145),
  ];
  let result = solveReactorContacts(reactor, bodies, CONFIG);
  for (let step = 0; step < 12; step += 1) {
    reactor = advanceReactor(result.reactor, 0.05, CONFIG);
    bodies = result.bodies.map((entry) => ({
      ...entry,
      x: entry.x + entry.vx * 0.05,
      y: entry.y + entry.vy * 0.05,
    }));
    result = solveReactorContacts(reactor, bodies, CONFIG);
  }
  return result;
}

// 1. Free fixed-step integration is repeatable and damped.
{
  const first = runFreeIntegration();
  const second = runFreeIntegration();
  assertApprox(first.x, second.x, 1e-12, "free integration x repeatability");
  assertApprox(first.y, second.y, 1e-12, "free integration y repeatability");
  assertApprox(first.vx, second.vx, 1e-12, "free integration vx repeatability");
  assertApprox(first.vy, second.vy, 1e-12, "free integration vy repeatability");
  assert(Math.hypot(first.vx, first.vy) < Math.hypot(300, -120), "free integration must damp speed");
}

// 2. Wall bounce clamps penetration, reflects only the normal component, preserves tangent velocity.
{
  const result = resolveReactorBounds({ ...REACTOR, x: 20, vx: -100, vy: 40 }, { width: 1600, height: 1000 }, CONFIG);
  assertApprox(result.x, REACTOR.radius, 1e-12, "wall clamp x");
  assertApprox(result.vx, 72, 1e-12, "wall reflected vx");
  assertApprox(result.vy, 40, 1e-12, "wall tangent vy");
}

// 3. One approaching impact transfers velocity toward the Reactor.
{
  const result = solveReactorContacts(REACTOR, [body("A", 737, 500, 200, 0)], CONFIG);
  assert(result.reactor.vx > 0, "single impact must push Reactor right");
  assert(result.bodies[0].vx < 200, "single impact must reduce player approach velocity");
  assert(result.contacts[0].impulseMagnitude > 0, "single impact must report an impulse");
}

// 4. Separating overlap gets positional correction but no restitution impulse.
{
  const result = solveReactorContacts(REACTOR, [body("A", 737, 500, -200, 0)], CONFIG);
  assertApprox(result.reactor.vx, 0, 1e-12, "separating overlap reactor vx");
  assertApprox(result.bodies[0].vx, -200, 1e-12, "separating overlap body vx");
  assertApprox(result.contacts[0].impulseMagnitude, 0, 1e-12, "separating overlap impulse");
  assert(result.bodies[0].x < 737 || result.reactor.x > 800, "separating overlap still corrects penetration");
}

// 5. Equal opposed contacts yield no net Reactor impulse.
{
  const contacts = [
    body("A", 737, 500, 200, 0),
    body("B", 863, 500, -200, 0),
  ];
  const result = solveReactorContacts(REACTOR, contacts, CONFIG);
  assertApprox(result.reactor.vx, 0, 1e-12, "equal opposed reactor vx");
  assertApprox(result.reactor.vy, 0, 1e-12, "equal opposed reactor vy");
}

// 6. Asymmetric opposed contacts have a stable net direction.
{
  const contacts = [
    body("A", 737, 500, 250, 0),
    body("B", 863, 500, -100, 0),
  ];
  const result = solveReactorContacts(REACTOR, contacts, CONFIG);
  assert(result.reactor.vx > 0, "stronger left impact must win to the right");
}

// 7. Same-side contacts remain finite and obey the Reactor speed safety bound.
{
  const contacts = [
    body("A", 738, 493, 5000, 0),
    body("B", 738, 507, 5000, 0),
  ];
  const result = solveReactorContacts(REACTOR, contacts, CONFIG);
  assertFiniteResult(result, "same-side contacts");
  assert(Math.hypot(result.reactor.vx, result.reactor.vy) <= CONFIG.maxSpeed + 1e-9, "Reactor speed clamp");
}

// 8. Two-contact input ordering does not change the canonical result.
{
  const a = body("A", 739, 494, 245, 15);
  const b = body("B", 861, 506, -130, -25);
  const ab = solveReactorContacts({ ...REACTOR, vx: 12, vy: -4 }, [a, b], CONFIG);
  const ba = solveReactorContacts({ ...REACTOR, vx: 12, vy: -4 }, [b, a], CONFIG);
  assertResultApprox(ab, ba, 1e-12, "two-contact permutation invariance");
}

// 9. Every permutation of three contacts yields the same canonical result.
{
  const contacts = [
    body("A", 739, 493, 210, 20),
    body("B", 861, 505, -170, -15),
    body("C", 803, 439, -5, 160),
  ];
  const variants = permutations(contacts);
  const baseline = solveReactorContacts({ ...REACTOR, vx: 9, vy: 6 }, variants[0], CONFIG);
  for (let index = 1; index < variants.length; index += 1) {
    const result = solveReactorContacts({ ...REACTOR, vx: 9, vy: 6 }, variants[index], CONFIG);
    assertResultApprox(result, baseline, 1e-12, `three-contact permutation ${index}`);
  }
}

// 10. Positional correction itself is permutation invariant even with zero impulse.
{
  const contacts = [
    body("A", 744, 495, 0, 0),
    body("B", 856, 505, 0, 0),
    body("C", 800, 444, 0, 0),
  ];
  const variants = permutations(contacts);
  const baseline = solveReactorContacts(REACTOR, variants[0], CONFIG);
  for (let index = 1; index < variants.length; index += 1) {
    const result = solveReactorContacts(REACTOR, variants[index], CONFIG);
    assertResultApprox(result, baseline, 1e-12, `correction permutation ${index}`);
  }
}

// 11. Deep overlap and exact-center degeneracy remain finite and escape deterministically.
{
  const result = solveReactorContacts(REACTOR, [body("CENTER", 800, 500, 0, 0)], CONFIG);
  assertFiniteResult(result, "exact-center degeneracy");
  const resolved = result.bodies[0];
  assert(resolved.x < REACTOR.x || result.reactor.x > REACTOR.x, "exact-center overlap must get deterministic x separation");
}

// 12. Repeated identical multi-step scenarios produce the same final canonical state.
{
  const first = runMultiStepScenario();
  const second = runMultiStepScenario();
  assertResultApprox(first, second, 1e-12, "multi-step repeatability");
}
