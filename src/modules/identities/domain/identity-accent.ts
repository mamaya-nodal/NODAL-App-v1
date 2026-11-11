const identityAccentCount = 8;

export function identityAccentIndex(identityId: string) {
  let hash = 2166136261;
  for (const character of identityId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % identityAccentCount;
}

export function identityAccentClass(identityId: string) {
  return `identity-accent identity-accent-${identityAccentIndex(identityId)}`;
}

