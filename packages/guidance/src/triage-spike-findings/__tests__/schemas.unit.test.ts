import { describe, expect, it } from 'vitest';

import { checkGate, findMissingTickets, RecordSchema } from '../schemas.ts';
import { buildItem, buildJiraRecord, buildRecord } from '../test-utils/build-record.ts';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const EVIDENCE = { key: 'src/a.ts:duplicated-setup', paths: ['src/a.ts'] };

describe('RecordSchema', () => {
  it('accepts a record with one item per disposition', () => {
    expect(RecordSchema.safeParse(buildRecord()).success).toBe(true);
  });

  it('rejects a record without items', () => {
    expect(RecordSchema.safeParse(buildRecord({ items: [] })).success).toBe(false);
  });

  it('accepts an item with evidence and a record with a commit', () => {
    const record = buildRecord({ commit: COMMIT, items: [buildItem({ evidence: EVIDENCE })] });
    expect(RecordSchema.safeParse(record).success).toBe(true);
  });

  it.each([
    ['an empty key', { commit: COMMIT, items: [buildItem({ evidence: { key: '', paths: ['a.ts'] } })] }],
    ['empty paths', { commit: COMMIT, items: [buildItem({ evidence: { key: 'a.ts:dup', paths: [] } })] }],
    ['a short commit', { commit: COMMIT.slice(0, 8) }],
    ['an uppercase commit', { commit: COMMIT.toUpperCase() }],
  ])('rejects %s', (_label, overrides) => {
    expect(RecordSchema.safeParse({ ...buildRecord(), ...overrides }).success).toBe(false);
  });

  it('reads a record without a platform as a GitHub record', () => {
    const { platform: _platform, ...legacy } = buildRecord();

    expect(RecordSchema.parse(legacy).platform).toBe('github');
  });

  it('accepts a Jira record and rejects an unknown platform', () => {
    expect(RecordSchema.safeParse(buildJiraRecord()).success).toBe(true);
    expect(RecordSchema.safeParse({ ...buildRecord(), platform: 'gitlab' }).success).toBe(false);
  });

  it('rejects a string reference that is not shaped like a key', () => {
    expect(RecordSchema.safeParse({ ...buildRecord(), triageTicket: '#278' }).success).toBe(false);
  });

  it('rejects a grade outside its family', () => {
    const record = { ...buildRecord(), items: [{ ...buildItem(), confidence: 'certain' }] };
    expect(RecordSchema.safeParse(record).success).toBe(false);
  });
});

describe(checkGate, () => {
  it('passes a record that meets every clause', () => {
    expect(checkGate(buildRecord())).toEqual([]);
  });

  it('refuses evidence on a record without a commit', () => {
    const record = buildRecord({ items: [buildItem({ evidence: EVIDENCE })] });
    expect(checkGate(record)).toEqual([{ id: '10', clause: 'an item has evidence only when the record has a commit' }]);
  });

  it('refuses a ticket at low confidence', () => {
    const record = buildRecord({ items: [buildItem({ confidence: 'low' })] });
    expect(checkGate(record)).toEqual([{ id: '10', clause: 'a low item does not take a ticket' }]);
  });

  it('refuses a merge whose target is not a ticket item', () => {
    const record = buildRecord({
      items: [
        buildItem({ id: 'a', disposition: 'drop' }),
        buildItem({ id: 'b', disposition: 'merge', target: 'a' }),
        buildItem({ id: 'c', disposition: 'merge', target: 'missing' }),
      ],
    });
    expect(checkGate(record).map((violation) => violation.id)).toEqual(['b', 'c']);
  });

  it('refuses a comment without an issue number', () => {
    const record = buildRecord({ items: [buildItem({ disposition: 'comment', target: '#272' })] });
    expect(checkGate(record)).toEqual([{ id: '10', clause: 'a comment names an issue number as its target' }]);
  });

  it('refuses a target on a ticket or a drop', () => {
    const record = buildRecord({
      items: [buildItem({ id: 't', target: 5 }), buildItem({ id: 'd', disposition: 'drop', target: 'x' })],
    });
    expect(checkGate(record).map((violation) => violation.clause)).toEqual([
      'a ticket item does not have a target',
      'a drop item does not have a target',
    ]);
  });

  it('refuses a ticket number on an item that does not take a ticket', () => {
    const record = buildRecord({ items: [buildItem({ disposition: 'drop', ticket: 300 })] });
    expect(checkGate(record)).toEqual([{ id: '10', clause: 'a drop item does not have a ticket number' }]);
  });

  it('refuses a duplicate id and reports every violation of a record', () => {
    const record = buildRecord({
      items: [buildItem({ id: 'x' }), buildItem({ id: 'x', confidence: 'low' })],
    });
    expect(checkGate(record)).toEqual([
      { id: 'x', clause: 'the id is declared more than once' },
      { id: 'x', clause: 'a low item does not take a ticket' },
    ]);
  });

  it('passes blockers that name other ticket items and issues outside the triage', () => {
    const record = buildRecord({
      items: [buildItem({ id: 'a', blockedBy: ['b', 412] }), buildItem({ id: 'b', blockedBy: [413] })],
    });
    expect(checkGate(record)).toEqual([]);
  });

  it('refuses blockers on an item that does not take a ticket', () => {
    const record = buildRecord({
      items: [buildItem({ id: 'a' }), buildItem({ id: 'd', disposition: 'drop', confidence: 'low', blockedBy: ['a'] })],
    });
    expect(checkGate(record)).toEqual([{ id: 'd', clause: 'a drop item does not have blockers' }]);
  });

  it('refuses a blocker that is unknown, not a ticket, the item itself, or listed twice', () => {
    const record = buildRecord({
      items: [
        buildItem({ id: 'a', blockedBy: ['missing', 'd', 'a', 7, 7] }),
        buildItem({ id: 'd', disposition: 'drop', confidence: 'low' }),
      ],
    });
    expect(checkGate(record).map((violation) => violation.clause)).toEqual([
      'the blocker missing is not an item',
      'a blocker is a ticket item, and d is a drop',
      'an item does not block itself',
      'the blocker 7 is listed more than once',
    ]);
  });

  it('refuses a cycle among the blockers and reports it once', () => {
    const record = buildRecord({
      items: [
        buildItem({ id: 'a', blockedBy: ['b'] }),
        buildItem({ id: 'b', blockedBy: ['c'] }),
        buildItem({ id: 'c', blockedBy: ['a'] }),
      ],
    });
    expect(checkGate(record)).toEqual([{ id: 'a', clause: 'a blocked-by cycle: a → b → c → a' }]);
  });
});

describe(`${checkGate.name} on a Jira record`, () => {
  it('passes keys, and blockers that name ticket items or work items outside the triage', () => {
    const record = buildJiraRecord({
      items: [
        buildItem({ id: 'C1', ticket: 'SCRATCHA-282', blockedBy: ['SCRATCHA-9'] }),
        buildItem({ id: 'C2', blockedBy: ['C1', 'SCRATCHA-9'] }),
        buildItem({ id: 'C3', disposition: 'comment', target: 'SCRATCHA-272' }),
      ],
    });

    expect(checkGate(record)).toEqual([]);
  });

  it('accepts a key as the umbrella and refuses an item id shaped like a key', () => {
    const record = buildJiraRecord({ umbrella: 'SCRATCHA-281', items: [buildItem({ id: 'AB-1' })] });

    expect(checkGate(record)).toEqual([
      { id: 'AB-1', clause: 'an item id on a Jira record is not shaped like a work item key' },
    ]);
  });

  it('refuses a number wherever a reference appears', () => {
    const record = buildJiraRecord({
      triageTicket: 278,
      items: [
        buildItem({ id: 'C1', ticket: 282, blockedBy: [412] }),
        buildItem({ id: 'C2', disposition: 'comment', target: 272 }),
      ],
    });

    expect(checkGate(record)).toEqual([
      { id: 'triageTicket', clause: 'the triage ticket is a work item key' },
      { id: 'C1', clause: 'the ticket is a work item key' },
      { id: 'C1', clause: 'the blocker 412 is not an item or a work item key' },
      { id: 'C2', clause: 'a comment names a work item key as its target' },
    ]);
  });

  it('refuses a blocker that is neither an item id nor a key', () => {
    const record = buildJiraRecord({ items: [buildItem({ id: 'C1', blockedBy: ['C9'] })] });

    expect(checkGate(record)).toEqual([{ id: 'C1', clause: 'the blocker C9 is not an item or a work item key' }]);
  });
});

describe(`${checkGate.name} on a GitHub record`, () => {
  it('refuses a key wherever a reference appears', () => {
    const record = buildRecord({
      triageTicket: 'SCRATCHA-278',
      umbrella: 'SCRATCHA-281',
      items: [
        buildItem({ id: 'a', ticket: 'SCRATCHA-282', blockedBy: ['SCRATCHA-9'] }),
        buildItem({ id: 'b', disposition: 'comment', target: 'SCRATCHA-272' }),
      ],
    });

    expect(checkGate(record)).toEqual([
      { id: 'triageTicket', clause: 'the triage ticket is an issue number' },
      { id: 'umbrella', clause: 'the umbrella is an issue number' },
      { id: 'a', clause: 'the ticket is an issue number' },
      { id: 'a', clause: 'the blocker SCRATCHA-9 is not an item' },
      { id: 'b', clause: 'a comment names an issue number as its target' },
    ]);
  });
});

describe(findMissingTickets, () => {
  it('names the ticket items without a number and the missing umbrella', () => {
    expect(findMissingTickets(buildRecord())).toEqual({ items: ['10'], umbrella: true });
  });

  it('does not require an umbrella when the record does not have any item that takes a ticket', () => {
    const record = buildRecord({ items: [buildItem({ disposition: 'drop', confidence: 'low' })] });
    expect(findMissingTickets(record)).toEqual({ items: [], umbrella: false });
  });

  it('reports the umbrella of a Jira record missing', () => {
    expect(findMissingTickets(buildJiraRecord())).toEqual({ items: ['C1'], umbrella: true });
  });

  it('does not require an umbrella once every ticket item has a ticket', () => {
    const record = buildJiraRecord({ items: [buildItem({ id: 'C1', ticket: 'SCRATCHA-282' })] });
    expect(findMissingTickets(record)).toEqual({ items: [], umbrella: false });
  });

  it('reports nothing missing once every number is recorded', () => {
    const record = buildRecord({ umbrella: 281, items: [buildItem({ ticket: 282 })] });
    expect(findMissingTickets(record)).toEqual({ items: [], umbrella: false });
  });
});
