const DEFAULT_BOX3D_BODY_NAME_MAX_BYTES = 18;
const encoder = new TextEncoder();

export function assertFoundationEngineRebindTokens(
  tokens: readonly string[],
  maxBytes = DEFAULT_BOX3D_BODY_NAME_MAX_BYTES,
): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("engine rebind token byte limit must be a positive safe integer");
  }

  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.length === 0) throw new Error("engine rebind token must not be empty");
    const byteLength = encoder.encode(token).byteLength;
    if (byteLength > maxBytes) {
      throw new Error(`engine rebind token ${JSON.stringify(token)} uses ${byteLength} bytes; limit is ${maxBytes}`);
    }
    if (seen.has(token)) throw new Error(`duplicate engine rebind token ${token}`);
    seen.add(token);
  }
}

export const FOUNDATION_BOX3D_BODY_NAME_MAX_BYTES = DEFAULT_BOX3D_BODY_NAME_MAX_BYTES;
