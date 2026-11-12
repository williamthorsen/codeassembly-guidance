/** A dependency between two tickets: `blocked` cannot start until `blocker` is merged. */
export interface Edge {
  blocked: string;
  blocker: string;
}

/** A ticket's place in the tree: its depth, and the blocker under which it is listed. */
export interface PlacedTicket {
  depth: number;
  id: string;
  parent: string | undefined;
}

/**
 * Arranges tickets as a tree in which each ticket is listed under one of its blockers, and returns the tree's
 * depth-first walk with the tickets that block each other. Read in order, the walk places every ticket below all of its
 * blockers, except inside a cycle. Tickets that the edges do not order keep the order of `ids`. An edge naming a
 * ticket outside `ids` is ignored.
 */
export function orderTickets(
  ids: readonly string[],
  edges: readonly Edge[],
): { cycle: string[]; placed: PlacedTicket[] } {
  const known = new Set(ids);
  const blockersOf = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const { blocked, blocker } of edges) {
    if (known.has(blocked) && known.has(blocker) && blocked !== blocker) {
      blockersOf.get(blocked)?.add(blocker);
    }
  }

  const sorted = sortAfterBlockers(ids, blockersOf);
  const children = new Map<string, string[]>();
  const parents = new Map<string, string>();
  const roots: string[] = [];
  for (const id of sorted) {
    const parent = findLastWalked([...(blockersOf.get(id) ?? [])], walk(roots, children));
    if (parent === undefined) {
      roots.push(id);
    } else {
      parents.set(id, parent);
      children.set(parent, [...(children.get(parent) ?? []), id]);
    }
  }

  const placed = walk(roots, children).map((id) => ({
    depth: countAncestors(id, parents),
    id,
    parent: parents.get(id),
  }));
  return { cycle: findCycleMembers(ids, blockersOf), placed };
}

// region | Helpers

/** Counts the tickets between `id` and its root. */
function countAncestors(id: string, parents: ReadonlyMap<string, string>): number {
  let depth = 0;
  for (let parent = parents.get(id); parent !== undefined; parent = parents.get(parent)) {
    depth += 1;
  }
  return depth;
}

/** Returns the tickets that lie on a cycle or between two cycles, in the order of `ids`. */
function findCycleMembers(ids: readonly string[], blockersOf: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  const remaining = new Set(ids);
  // Remove, until neither rule applies, each ticket without a remaining blocker and each that does not block any.
  for (let removed = true; removed;) {
    removed = false;
    for (const id of remaining) {
      const hasBlocker = [...(blockersOf.get(id) ?? [])].some((blocker) => remaining.has(blocker));
      const blocksAny = [...remaining].some((other) => blockersOf.get(other)?.has(id) === true);
      if (!(!hasBlocker || !blocksAny)) {
        continue;
      }

      remaining.delete(id);
      removed = true;
    }
  }
  return ids.filter((id) => remaining.has(id));
}

/** Returns the member of `candidates` that comes last in `walked`, or `undefined` when `walked` contains none. */
function findLastWalked(candidates: readonly string[], walked: readonly string[]): string | undefined {
  let last: string | undefined;
  let lastPosition = -1;
  for (const candidate of candidates) {
    const position = walked.indexOf(candidate);
    if (!(position > lastPosition)) {
      continue;
    }

    last = candidate;
    lastPosition = position;
  }
  return last;
}

/**
 * Sorts tickets so that each follows its blockers, taking at each step the ready ticket that comes first in `ids`.
 * When every remaining ticket waits on another, the one that comes first in `ids` is taken as though it were ready.
 */
function sortAfterBlockers(ids: readonly string[], blockersOf: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  const sorted: string[] = [];
  const done = new Set<string>();
  while (sorted.length < ids.length) {
    const pending = ids.filter((id) => !done.has(id));
    const next =
      pending.find((id) => [...(blockersOf.get(id) ?? [])].every((blocker) => done.has(blocker))) ?? pending[0];
    if (next === undefined) {
      break;
    }
    sorted.push(next);
    done.add(next);
  }
  return sorted;
}

/** Walks the tree depth-first, visiting each ticket before its children. */
function walk(roots: readonly string[], children: ReadonlyMap<string, readonly string[]>): string[] {
  return roots.flatMap((root) => [root, ...walk(children.get(root) ?? [], children)]);
}

// endregion | Helpers
