/**
 * Derives a short prefix for each `owner/name` repository, unique within the set: the upper-case initials of the name's
 * segments, or the first two letters of a single-segment name. Names whose prefixes collide each take further letters
 * of their last segment until the prefixes differ, and the whole name when the segment is used up. Repositories that
 * share a name under different owners also take letters of the owner, in front. A repository whose prefix still equals
 * another's takes its whole `OWNER/NAME`. Case does not distinguish one repository from another.
 */
export function derivePrefixes(repositories: readonly string[]): Map<string, string> {
  const unique = [...new Set(repositories.map((repository) => repository.toLowerCase()))];
  const byName = lengthenUntilDistinct([...new Set(unique.map(readName))], buildNamePrefix);

  const composed = new Map<string, string>();
  for (const name of byName.keys()) {
    const sharing = unique.filter((repository) => readName(repository) === name);
    const owners = lengthenUntilDistinct(sharing.map(readOwner), (owner, extra) =>
      sharing.length === 1 ? '' : owner.slice(0, extra + 1).toUpperCase(),
    );
    for (const repository of sharing) {
      composed.set(repository, `${owners.get(readOwner(repository)) ?? ''}${byName.get(name) ?? ''}`);
    }
  }

  const taken = composed.values().toArray();
  return new Map(
    repositories.map((repository) => {
      const prefix = composed.get(repository.toLowerCase());
      const isShared = taken.filter((other) => other === prefix).length > 1;
      return [repository, prefix === undefined || isShared ? repository.toUpperCase() : prefix];
    }),
  );
}

// region | Helpers

/** Builds a name's prefix with `extra` further letters of its last segment, or the whole name once they run out. */
function buildNamePrefix(name: string, extra: number): string {
  const segments = name.split(/[-._]/).filter((segment) => segment !== '');
  const last = segments.at(-1) ?? name;
  const leading = segments.slice(0, -1).map((segment) => segment.slice(0, 1));
  const baseLength = segments.length > 1 ? 1 : 2;
  if (baseLength + extra > last.length && extra > 0) {
    return name.toUpperCase();
  }
  return [...leading, last.slice(0, baseLength + extra)].join('').toUpperCase();
}

/** Lengthens the prefix of every colliding key, one letter per round, until every key's prefix is distinct. */
function lengthenUntilDistinct(
  keys: readonly string[],
  build: (key: string, extra: number) => string,
): Map<string, string> {
  const extras = new Map(keys.map((key) => [key, 0]));
  const longest = Math.max(0, ...keys.map((key) => key.length));
  for (let round = 0; round <= longest; round += 1) {
    const prefixes = new Map(keys.map((key) => [key, build(key, extras.get(key) ?? 0)]));
    const colliding = keys.filter((key) =>
      keys.some((other) => other !== key && prefixes.get(other) === prefixes.get(key)),
    );
    if (colliding.length === 0) {
      return prefixes;
    }
    for (const key of colliding) {
      extras.set(key, (extras.get(key) ?? 0) + 1);
    }
  }
  return new Map(keys.map((key) => [key, key.toUpperCase()]));
}

/** Returns the part of `owner/name` after the slash. */
function readName(repository: string): string {
  return repository.slice(repository.indexOf('/') + 1);
}

/** Returns the part of `owner/name` before the slash. */
function readOwner(repository: string): string {
  return repository.slice(0, Math.max(0, repository.indexOf('/')));
}

// endregion | Helpers
