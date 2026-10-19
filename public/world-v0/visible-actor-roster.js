// MF6 presentation roster, deliberately separate from simulation identity/authority.
// Only actor session identities present in BOTH the verified topology and live
// local physics can own a rendered remote mesh.
export const WORLD_V0_VISIBLE_ACTOR_ROSTER_REVISION = "mf6-visible-actor-roster-v1";

export function planWorldV0VisibleRemotes(topology, selfSessionId, bodySessionIds, renderedSessionIds = []) {
  if (!topology || !Array.isArray(topology.actors)) throw new Error("visible roster missing topology");
  if (typeof selfSessionId !== "string" || !selfSessionId) throw new Error("visible roster missing self");
  if (!Array.isArray(bodySessionIds) || !Array.isArray(renderedSessionIds)) throw new Error("visible roster invalid identities");
  if (topology.actors.length < 1 || topology.actors.length > 6) throw new Error("visible roster outside MF6 envelope");
  const physical = new Set(bodySessionIds);
  const seen = new Set();
  const remoteActors = [];
  let selfFound = false;
  for (const actor of topology.actors) {
    const { sessionId, netEntityId, slot } = actor || {};
    if (typeof sessionId !== "string" || !sessionId ||
        typeof netEntityId !== "string" || !netEntityId ||
        !Number.isInteger(slot) || slot < 0 || slot > 5 ||
        seen.has(sessionId)) throw new Error("visible roster invalid actor identity");
    seen.add(sessionId);
    if (sessionId === selfSessionId) { selfFound = true; continue; }
    if (physical.has(sessionId)) remoteActors.push({sessionId,netEntityId,slot});
  }
  if (!selfFound) throw new Error("visible roster self absent from topology");
  const desired = new Set(remoteActors.map(actor => actor.sessionId));
  const rendered = new Set(renderedSessionIds);
  return {
    remoteActors,
    createSessionIds: remoteActors.filter(actor => !rendered.has(actor.sessionId)).map(actor => actor.sessionId),
    removeSessionIds: renderedSessionIds.filter(sessionId => !desired.has(sessionId)),
  };
}
