// Builds token-shaped strings at runtime, so that test sources do not contain literals that a secret scanner flags.

const MIXED_ALPHABET = 'aB3xK9mQ2pL7vN4rT8wZ1cF6hJ5dS0gY';
const UPPER_ALPHABET = 'A3XK9MQ2PL7VN4RT8WZ1CF6HJ5DS0GYB';

/** Returns `prefix` followed by `length` deterministic characters, mixed-case with digits or uppercase only. */
export function makeFakeToken(prefix: string, length: number, alphabet: 'mixed' | 'upper' = 'mixed'): string {
  const characters = alphabet === 'upper' ? UPPER_ALPHABET : MIXED_ALPHABET;
  const suffix = Array.from({ length }, (_, index) => characters.charAt((index * 7) % characters.length)).join('');
  return `${prefix}${suffix}`;
}
