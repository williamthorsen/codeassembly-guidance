import { describe, expect, it } from 'vitest';

import { type Edge, orderTickets } from '../order.ts';

describe(orderTickets, () => {
  it('nests each ticket of a chain under its blocker, whatever the input order', () => {
    const { cycle, placed } = orderTickets(['c', 'a', 'b'], [edge('a', 'b'), edge('b', 'c')]);

    expect(placed).toEqual([
      { depth: 0, id: 'a', parent: undefined },
      { depth: 1, id: 'b', parent: 'a' },
      { depth: 2, id: 'c', parent: 'b' },
    ]);
    expect(cycle).toEqual([]);
  });

  it('keeps the input order of tickets that the edges do not order', () => {
    const { placed } = orderTickets(['b', 'c', 'a'], []);

    expect(placed.map(({ id }) => id)).toEqual(['b', 'c', 'a']);
  });

  it('lists the children of one blocker in input order', () => {
    const { placed } = orderTickets(['root', 'y', 'x'], [edge('root', 'x'), edge('root', 'y')]);

    expect(placed.map(({ id }) => id)).toEqual(['root', 'y', 'x']);
  });

  it('places a ticket with two blockers in separate chains below both of them', () => {
    const edges = [edge('r1', 'p'), edge('r2', 'b'), edge('b', 't'), edge('p', 't')];

    const { placed } = orderTickets(['r1', 'r2', 'b', 'p', 't'], edges);

    const ids = placed.map(({ id }) => id);
    expect(ids.indexOf('t')).toBeGreaterThan(ids.indexOf('b'));
    expect(ids.indexOf('t')).toBeGreaterThan(ids.indexOf('p'));
    expect(placed.find(({ id }) => id === 't')).toEqual({ depth: 2, id: 't', parent: 'b' });
  });

  it('ignores an edge whose blocker is not among the tickets', () => {
    const { placed } = orderTickets(['a'], [edge('elsewhere', 'a')]);

    expect(placed).toEqual([{ depth: 0, id: 'a', parent: undefined }]);
  });

  it('reports the tickets that block each other, and still places every ticket', () => {
    const edges = [edge('a', 'b'), edge('b', 'a'), edge('b', 'after')];

    const { cycle, placed } = orderTickets(['before', 'a', 'b', 'after'], edges);

    expect(cycle).toEqual(['a', 'b']);
    expect(placed.map(({ id }) => id)).toEqual(['before', 'a', 'b', 'after']);
  });

  it('places a ticket that waits on a cycle below the cycle, although it comes first in the input', () => {
    const edges = [edge('a', 'b'), edge('b', 'a'), edge('a', 'down')];

    const { cycle, placed } = orderTickets(['down', 'a', 'b'], edges);

    expect(cycle).toEqual(['a', 'b']);
    expect(placed.find(({ id }) => id === 'down')).toEqual({ depth: 1, id: 'down', parent: 'a' });
  });
});

// region | Helpers

/** Builds the edge that `blocker` blocks `blocked`. */
function edge(blocker: string, blocked: string): Edge {
  return { blocked, blocker };
}

// endregion | Helpers
