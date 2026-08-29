export type ReactorState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

export type ReactorContactBody = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
};

export type ReactorPhysicsConfig = {
  reactorMass: number;
  restitution: number;
  wallRestitution: number;
  drag: number;
  maxSpeed: number;
  positionSlop: number;
  positionCorrection: number;
  correctionPasses: number;
};

export type ReactorWorldBounds = {
  width: number;
  height: number;
};

export type ReactorContactResult = {
  reactor: ReactorState;
  bodies: ReactorContactBody[];
  contacts: Array<{ id: string; impulseMagnitude: number }>;
};

type Contact = {
  bodyIndex: number;
  id: string;
  nx: number;
  ny: number;
  penetration: number;
};

const NORMAL_EPSILON = 1e-9;

function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cloneReactor(state: ReactorState): ReactorState {
  return { ...state };
}

function cloneBody(body: ReactorContactBody): ReactorContactBody {
  return { ...body };
}

function clampSpeed(state: ReactorState, maxSpeed: number): ReactorState {
  if (!(maxSpeed > 0)) return { ...state, vx: 0, vy: 0 };
  const speed = Math.hypot(state.vx, state.vy);
  if (speed <= maxSpeed || speed <= NORMAL_EPSILON) return state;
  const scale = maxSpeed / speed;
  return { ...state, vx: state.vx * scale, vy: state.vy * scale };
}

function contactNormal(body: ReactorContactBody, reactor: ReactorState): { nx: number; ny: number; distance: number } {
  const dx = reactor.x - body.x;
  const dy = reactor.y - body.y;
  const distance = Math.hypot(dx, dy);
  if (distance > NORMAL_EPSILON) {
    return { nx: dx / distance, ny: dy / distance, distance };
  }

  const approachX = body.vx - reactor.vx;
  const approachY = body.vy - reactor.vy;
  const approachSpeed = Math.hypot(approachX, approachY);
  if (approachSpeed > NORMAL_EPSILON) {
    return { nx: approachX / approachSpeed, ny: approachY / approachSpeed, distance: 0 };
  }

  return { nx: 1, ny: 0, distance: 0 };
}

function detectContacts(reactor: ReactorState, bodies: ReactorContactBody[]): Contact[] {
  const contacts: Contact[] = [];
  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index];
    const normal = contactNormal(body, reactor);
    const penetration = body.radius + reactor.radius - normal.distance;
    if (penetration <= 0) continue;
    contacts.push({
      bodyIndex: index,
      id: body.id,
      nx: normal.nx,
      ny: normal.ny,
      penetration,
    });
  }
  return contacts;
}

function canonicalBodies(input: ReactorContactBody[]): ReactorContactBody[] {
  const bodies = input.map(cloneBody).sort((a, b) => compareId(a.id, b.id));
  for (let index = 1; index < bodies.length; index += 1) {
    if (bodies[index - 1].id === bodies[index].id) {
      throw new Error(`duplicate_reactor_contact_id:${bodies[index].id}`);
    }
  }
  return bodies;
}

export function advanceReactor(
  state: ReactorState,
  dt: number,
  config: ReactorPhysicsConfig,
): ReactorState {
  if (!Number.isFinite(dt) || dt < 0) throw new Error("invalid_reactor_dt");
  const damping = Math.exp(-Math.max(0, config.drag) * dt);
  let next: ReactorState = {
    ...state,
    vx: state.vx * damping,
    vy: state.vy * damping,
  };
  next = clampSpeed(next, config.maxSpeed);
  next.x += next.vx * dt;
  next.y += next.vy * dt;
  return next;
}

export function resolveReactorBounds(
  state: ReactorState,
  bounds: ReactorWorldBounds,
  config: ReactorPhysicsConfig,
): ReactorState {
  const next = cloneReactor(state);
  const restitution = Math.max(0, config.wallRestitution);

  if (next.x < next.radius) {
    next.x = next.radius;
    if (next.vx < 0) next.vx = -next.vx * restitution;
  } else if (next.x > bounds.width - next.radius) {
    next.x = bounds.width - next.radius;
    if (next.vx > 0) next.vx = -next.vx * restitution;
  }

  if (next.y < next.radius) {
    next.y = next.radius;
    if (next.vy < 0) next.vy = -next.vy * restitution;
  } else if (next.y > bounds.height - next.radius) {
    next.y = bounds.height - next.radius;
    if (next.vy > 0) next.vy = -next.vy * restitution;
  }

  return next;
}

export function solveReactorContacts(
  reactorInput: ReactorState,
  bodyInput: ReactorContactBody[],
  config: ReactorPhysicsConfig,
): ReactorContactResult {
  if (!(config.reactorMass > 0)) throw new Error("invalid_reactor_mass");

  let reactor = cloneReactor(reactorInput);
  const bodies = canonicalBodies(bodyInput);
  for (const body of bodies) {
    if (!(body.mass > 0)) throw new Error(`invalid_contact_mass:${body.id}`);
  }

  const initialContacts = detectContacts(reactor, bodies);
  const bodyVelocityDeltas = bodies.map(() => ({ x: 0, y: 0 }));
  let reactorDeltaVx = 0;
  let reactorDeltaVy = 0;
  const impulseById = new Map<string, number>();
  const inverseReactorMass = 1 / config.reactorMass;

  for (const contact of initialContacts) {
    const body = bodies[contact.bodyIndex];
    const relativeNormalVelocity =
      (reactor.vx - body.vx) * contact.nx +
      (reactor.vy - body.vy) * contact.ny;

    let impulseMagnitude = 0;
    if (relativeNormalVelocity < 0) {
      const inverseBodyMass = 1 / body.mass;
      impulseMagnitude =
        -(1 + Math.max(0, config.restitution)) * relativeNormalVelocity /
        (inverseBodyMass + inverseReactorMass);

      const impulseX = impulseMagnitude * contact.nx;
      const impulseY = impulseMagnitude * contact.ny;
      bodyVelocityDeltas[contact.bodyIndex].x -= impulseX * inverseBodyMass;
      bodyVelocityDeltas[contact.bodyIndex].y -= impulseY * inverseBodyMass;
      reactorDeltaVx += impulseX * inverseReactorMass;
      reactorDeltaVy += impulseY * inverseReactorMass;
    }
    impulseById.set(contact.id, impulseMagnitude);
  }

  for (let index = 0; index < bodies.length; index += 1) {
    bodies[index].vx += bodyVelocityDeltas[index].x;
    bodies[index].vy += bodyVelocityDeltas[index].y;
  }
  reactor.vx += reactorDeltaVx;
  reactor.vy += reactorDeltaVy;
  reactor = clampSpeed(reactor, config.maxSpeed);

  const passes = Math.max(0, Math.trunc(config.correctionPasses));
  for (let pass = 0; pass < passes; pass += 1) {
    const contacts = detectContacts(reactor, bodies);
    if (contacts.length === 0) break;

    const bodyPositionDeltas = bodies.map(() => ({ x: 0, y: 0 }));
    let reactorDeltaX = 0;
    let reactorDeltaY = 0;

    for (const contact of contacts) {
      const body = bodies[contact.bodyIndex];
      const penetration = contact.penetration - Math.max(0, config.positionSlop);
      if (penetration <= 0) continue;

      const inverseBodyMass = 1 / body.mass;
      const inverseMassSum = inverseBodyMass + inverseReactorMass;
      const correctionMagnitude =
        penetration * Math.max(0, config.positionCorrection) / inverseMassSum;
      const correctionX = correctionMagnitude * contact.nx;
      const correctionY = correctionMagnitude * contact.ny;

      bodyPositionDeltas[contact.bodyIndex].x -= correctionX * inverseBodyMass;
      bodyPositionDeltas[contact.bodyIndex].y -= correctionY * inverseBodyMass;
      reactorDeltaX += correctionX * inverseReactorMass;
      reactorDeltaY += correctionY * inverseReactorMass;
    }

    for (let index = 0; index < bodies.length; index += 1) {
      bodies[index].x += bodyPositionDeltas[index].x;
      bodies[index].y += bodyPositionDeltas[index].y;
    }
    reactor.x += reactorDeltaX;
    reactor.y += reactorDeltaY;
  }

  return {
    reactor,
    bodies,
    contacts: initialContacts.map((contact) => ({
      id: contact.id,
      impulseMagnitude: impulseById.get(contact.id) ?? 0,
    })),
  };
}
