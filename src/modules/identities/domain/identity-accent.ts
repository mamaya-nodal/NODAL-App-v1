export function identityAccentHue(identityId: string) {
  let hash = 2166136261;
  for (const character of identityId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}

export function identityAccentClass(identityId: string) {
  return `identity-accent identity-hue-${identityAccentHue(identityId)}`;
}

export function identityAccentStyle(identityId: string) {
  const hue = identityAccentHue(identityId);
  return {
    "--identity-accent-dark": `hsl(${hue} 78% 70%)`,
    "--identity-accent-day": `hsl(${hue} 68% 34%)`,
  };
}

