export const WORLD_V0_CENTRAL_INTERACTION_PROP_IDS = Object.freeze([
  "prop-0",
  "prop-1",
  "prop-2",
  "prop-3",
  "prop-4",
  "prop-5",
]);

function assertFinitePosition(position, label) {
  if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) {
    throw new Error(`${label} has invalid position ${JSON.stringify(position)}`);
  }
}

function entityId(entity) {
  return entity?.netEntityId ?? entity?.id ?? null;
}

export function deriveWorldV0AuthorityProbe(state, selfSessionId) {
  if (!state || !Array.isArray(state.players) || !Array.isArray(state.props)) {
    throw new Error("authority probe requires a dynamic B(0) state");
  }
  if (typeof selfSessionId !== "string" || selfSessionId.length === 0) {
    throw new Error("authority probe requires welcome.selfSessionId");
  }

  const actor = state.players.find((player) => player.sessionId === selfSessionId);
  if (!actor) throw new Error(`authority probe could not find controlled actor for ${selfSessionId}`);
  assertFinitePosition(actor.position, `controlled actor ${selfSessionId}`);

  const centralProps = WORLD_V0_CENTRAL_INTERACTION_PROP_IDS.map((id) => {
    const prop = state.props.find((candidate) => entityId(candidate) === id);
    if (!prop) throw new Error(`authority probe missing central interaction prop ${id}`);
    assertFinitePosition(prop.position, id);
    return prop;
  });

  const target = [0, 0, 0];
  for (const prop of centralProps) {
    target[0] += prop.position[0];
    target[1] += prop.position[1];
    target[2] += prop.position[2];
  }
  target[0] /= centralProps.length;
  target[1] /= centralProps.length;
  target[2] /= centralProps.length;

  const dx = target[0] - actor.position[0];
  const dz = target[2] - actor.position[2];
  const planarDistance = Math.hypot(dx, dz);
  if (!(planarDistance > 1e-6)) {
    throw new Error(`authority probe actor ${selfSessionId} is already at central target ${JSON.stringify(target)}`);
  }

  return {
    selfSessionId,
    actorNetEntityId: entityId(actor),
    actorPosition: [...actor.position],
    targetPropIds: [...WORLD_V0_CENTRAL_INTERACTION_PROP_IDS],
    target,
    planarDistance,
    input: {
      x: dx / planarDistance,
      z: dz / planarDistance,
    },
  };
}
