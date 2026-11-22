import { describe, expect, it } from 'vitest';

import type { GhRunner } from '../../shared/gh.ts';
import { listImplementationOrder } from '../cli.ts';

interface FakeIssue {
  blockedBy?: string[];
  state?: 'CLOSED' | 'OPEN';
  subIssues?: { completed: number; total: number };
  title?: string;
}

describe(listImplementationOrder, () => {
  it('lists a ticket under its blocker in another repository, with a prefix per repository', async () => {
    const gh = makeGh({ 'acme/site-tools#2': { blockedBy: ['acme/core-lib#1'] }, 'acme/core-lib#1': {} });

    const order = await listImplementationOrder(['--ticket', 'acme/site-tools#2', '--ticket', 'acme/core-lib#1'], gh);

    expect(order.tickets).toMatchObject([
      { depth: 0, label: 'cl.1', otherBlockers: [], ref: 'acme/core-lib#1' },
      { depth: 1, label: 'st.2', otherBlockers: [], ref: 'acme/site-tools#2' },
    ]);
    expect(order).toMatchObject({ cycle: [], omitted: [] });
  });

  it('names an open blocker that is not listed, and marks it as in another repository', async () => {
    const gh = makeGh({ 'acme/site-tools#2': { blockedBy: ['acme/core-lib#1'] }, 'acme/core-lib#1': {} });

    const order = await listImplementationOrder(['--ticket', 'acme/site-tools#2'], gh);

    expect(order.tickets).toMatchObject([
      { depth: 0, otherBlockers: [{ crossRepository: true, label: 'cl.1', ref: 'acme/core-lib#1' }] },
    ]);
  });

  it('names the blocker that the tree does not state when a ticket has two', async () => {
    const gh = makeGh({
      'acme/app#1': {},
      'acme/app#2': {},
      'acme/app#3': { blockedBy: ['acme/app#1', 'acme/app#2'] },
    });

    const order = await listImplementationOrder(
      ['--ticket', 'acme/app#1', '--ticket', 'acme/app#2', '--ticket', 'acme/app#3'],
      gh,
    );

    expect(order.tickets.at(-1)).toMatchObject({
      depth: 1,
      otherBlockers: [{ crossRepository: false, label: 'ap.1' }],
      ref: 'acme/app#3',
    });
  });

  it('leaves a closed ticket out of the list and out of the blockers', async () => {
    const gh = makeGh({ 'acme/app#1': { state: 'CLOSED' }, 'acme/app#2': { blockedBy: ['acme/app#1'] } });

    const order = await listImplementationOrder(['--ticket', 'acme/app#1', '--ticket', 'acme/app#2'], gh);

    expect(order.omitted).toEqual([{ reason: 'closed', ref: 'acme/app#1' }]);
    expect(order.tickets).toMatchObject([{ depth: 0, otherBlockers: [], ref: 'acme/app#2' }]);
  });

  it.each([
    { children: 'open', subIssues: { completed: 0, total: 2 } },
    { children: 'closed', subIssues: { completed: 2, total: 2 } },
  ])('leaves out an umbrella whose children are $children, naming it as an umbrella', async ({ subIssues }) => {
    const gh = makeGh({ 'acme/app#1': { subIssues }, 'acme/app#2': {} });

    const order = await listImplementationOrder(['--ticket', 'acme/app#1', '--ticket', 'acme/app#2'], gh);

    expect(order.omitted).toEqual([{ reason: 'umbrella', ref: 'acme/app#1' }]);
    expect(order.tickets.map(({ ref }) => ref)).toEqual(['acme/app#2']);
  });

  it('names a closed umbrella as closed', async () => {
    const gh = makeGh({ 'acme/app#1': { state: 'CLOSED', subIssues: { completed: 2, total: 2 } } });

    const order = await listImplementationOrder(['--ticket', 'acme/app#1'], gh);

    expect(order.omitted).toEqual([{ reason: 'closed', ref: 'acme/app#1' }]);
  });

  it('lists the children of an omitted umbrella as it lists them without the umbrella', async () => {
    const gh = makeGh({
      'acme/app#1': { subIssues: { completed: 0, total: 3 } },
      'acme/app#2': {},
      'acme/app#3': { blockedBy: ['acme/app#2'] },
      'acme/app#4': { blockedBy: ['acme/app#2', 'acme/core-lib#9'] },
      'acme/core-lib#9': {},
    });
    const children = ['--ticket', 'acme/app#2', '--ticket', 'acme/app#3', '--ticket', 'acme/app#4'];

    const withUmbrella = await listImplementationOrder(['--ticket', 'acme/app#1', ...children], gh);
    const withoutUmbrella = await listImplementationOrder(children, gh);

    expect(withUmbrella.tickets).toEqual(withoutUmbrella.tickets);
  });

  it('orders by a supplied edge, and lists a ticket outside GitHub by its key', async () => {
    const gh = makeGh({ 'acme/app#1': {} });

    const order = await listImplementationOrder(
      ['--external', 'MAC-7=Move the board', '--ticket', 'acme/app#1', '--edge', 'acme/app#1>MAC-7'],
      gh,
    );

    expect(order.tickets).toMatchObject([
      { depth: 0, label: 'ap.1' },
      { depth: 1, label: 'MAC-7', number: null, prefix: null, repository: null, title: 'Move the board' },
    ]);
  });

  it('prefixes a ticket outside GitHub with the prefix of its repository, shared with a GitHub ticket there', async () => {
    const gh = makeGh({ 'acme/macos-config#1': {} });

    const order = await listImplementationOrder(
      ['--ticket', 'acme/macos-config#1', '--external', 'acme/macos-config:MAC-7=Move the board'],
      gh,
    );

    expect(order.tickets).toMatchObject([
      { label: 'mc.1', prefix: 'mc' },
      { label: 'mc.MAC-7', prefix: 'mc', ref: 'MAC-7', repository: 'acme/macos-config' },
    ]);
  });

  it('gives a repository named without its owner the prefix of the GitHub ticket in that repository', async () => {
    const gh = makeGh({ 'acme/macos-config#1': {} });

    const order = await listImplementationOrder(
      [
        '--ticket',
        'acme/macos-config#1',
        '--external',
        'macos-config:MAC-7=Move the board',
        '--edge',
        'acme/macos-config#1>MAC-7',
      ],
      gh,
    );

    expect(order.tickets).toMatchObject([{ label: 'mc.1' }, { label: 'mc.MAC-7', repository: 'acme/macos-config' }]);
  });

  it('marks a ticket outside GitHub as in another repository than its blocker', async () => {
    const gh = makeGh({ 'acme/core-lib#1': {} });

    const order = await listImplementationOrder(
      ['--external', 'workbench:WB-3=Adopt the helper', '--edge', 'acme/core-lib#1>WB-3'],
      gh,
    );

    expect(order.tickets).toMatchObject([
      { label: 'wo.WB-3', otherBlockers: [{ crossRepository: true, label: 'cl.1' }] },
    ]);
  });

  it('reads a supplied blocker that is not listed, to learn whether it is open', async () => {
    const gh = makeGh({ 'acme/app#1': {}, 'acme/app#9': { state: 'CLOSED' }, 'acme/core-lib#4': {} });

    const order = await listImplementationOrder(
      ['--ticket', 'acme/app#1', '--edge', 'acme/app#9>acme/app#1', '--edge', 'acme/core-lib#4>acme/app#1'],
      gh,
    );

    expect(order.tickets[0]?.otherBlockers).toMatchObject([{ ref: 'acme/core-lib#4' }]);
  });

  it('reports tickets that block each other', async () => {
    const gh = makeGh({ 'acme/app#1': { blockedBy: ['acme/app#2'] }, 'acme/app#2': { blockedBy: ['acme/app#1'] } });

    const order = await listImplementationOrder(['--ticket', 'acme/app#1', '--ticket', 'acme/app#2'], gh);

    expect(order.cycle).toEqual(['acme/app#1', 'acme/app#2']);
    expect(order.tickets).toHaveLength(2);
  });

  it('indents each line by its depth and leaves the title the rest of 60 characters', async () => {
    const gh = makeGh({ 'acme/app#1': {}, 'acme/app#22': { blockedBy: ['acme/app#1'] } });

    const order = await listImplementationOrder(['--ticket', 'acme/app#1', '--ticket', 'acme/app#22'], gh);

    expect(order.tickets.map(({ lead }) => /^ */.exec(lead)?.[0].length)).toEqual([0, 2]);
    expect(order.tickets.map(({ lead, titleBudget }) => lead.length + titleBudget)).toEqual([60, 60]);
    expect(order.tickets[1]?.lead).toContain('ap.22 ');
  });

  it('writes the blocker line one level under its ticket', async () => {
    const gh = makeGh({ 'acme/app#2': { blockedBy: ['acme/core-lib#1', 'acme/core-lib#3'] } });

    const order = await listImplementationOrder(['--ticket', 'acme/app#2'], gh);

    expect(order.tickets[0]?.blockerLine).toBe('  ⛔ by cl.1, cl.3');
  });

  it('names the listed tickets in another repository that a ticket blocks, wherever the tree places them', async () => {
    const gh = makeGh({
      'acme/app#2': { blockedBy: ['acme/core-lib#1'] },
      'acme/core-lib#1': {},
      'acme/core-lib#3': { blockedBy: ['acme/core-lib#1'] },
      'acme/site-tools#5': { blockedBy: ['acme/app#2', 'acme/core-lib#1'] },
    });

    const order = await listImplementationOrder(
      [
        '--ticket',
        'acme/core-lib#1',
        '--ticket',
        'acme/app#2',
        '--ticket',
        'acme/core-lib#3',
        '--ticket',
        'acme/site-tools#5',
      ],
      gh,
    );

    expect(order.tickets.find(({ label }) => label === 'cl.1')?.crossRepositoryBlocked).toEqual(['ap.2', 'st.5']);
    expect(order.tickets.find(({ label }) => label === 'ap.2')?.crossRepositoryBlocked).toEqual(['st.5']);
    expect(order.tickets.find(({ label }) => label === 'cl.3')?.crossRepositoryBlocked).toEqual([]);
  });

  it('leaves the gate line the rest of 60 characters after its lead', async () => {
    const gh = makeGh({ 'acme/app#1': {}, 'acme/app#2': { blockedBy: ['acme/app#1'] } });

    const order = await listImplementationOrder(['--ticket', 'acme/app#1', '--ticket', 'acme/app#2'], gh);

    expect(order.tickets.map(({ gateLead }) => gateLead)).toEqual(['  📦 publish ', '    📦 publish ']);
    expect(order.tickets.map(({ gateBudget, gateLead }) => gateLead.length + gateBudget)).toEqual([60, 60]);
  });

  it('fails the whole run, naming the ticket, when one ticket cannot be read', async () => {
    const gh = makeGh({ 'acme/app#1': {} });

    await expect(listImplementationOrder(['--ticket', 'acme/app#1', '--ticket', 'acme/app#404'], gh)).rejects.toThrow(
      'ticket acme/app#404 cannot be read',
    );
  });

  it.each([
    { argv: ['--ticket', 'app#1'], reason: '--ticket takes OWNER/REPO#N' },
    { argv: ['--external', 'MAC-7'], reason: '--external takes [REPOSITORY:]KEY=Title' },
    { argv: ['--external', 'a/b/c:MAC-7=Move the board'], reason: '--external takes [REPOSITORY:]KEY=Title' },
    { argv: ['--ticket', 'acme/app#1', '--edge', 'MAC-7>acme/app#1'], reason: '--edge takes BLOCKER>BLOCKED' },
    { argv: ['--ticket', 'acme/app#1', '--edge', 'acme/app#1>acme/app#2'], reason: 'as blocked' },
  ])('refuses $argv', async ({ argv, reason }) => {
    await expect(listImplementationOrder(argv, makeGh({ 'acme/app#1': {} }))).rejects.toThrow(reason);
  });
});

// region | Helpers

/** Builds a `gh` runner that answers `issue view` from the given issues and reports any other issue as not found. */
function makeGh(issues: Record<string, FakeIssue>): GhRunner {
  return (args) => {
    const ref = `${args[4] ?? ''}#${args[2] ?? ''}`;
    const issue = issues[ref];
    if (issue === undefined) {
      return Promise.resolve({ exitCode: 1, stderr: 'GraphQL: Could not resolve to an Issue\n', stdout: '' });
    }
    const view = {
      ...toNode(ref, issue),
      blockedBy: { nodes: (issue.blockedBy ?? []).map((blocker) => toNode(blocker, issues[blocker] ?? {})) },
      subIssuesSummary: issue.subIssues ?? { completed: 0, total: 0 },
    };
    return Promise.resolve({ exitCode: 0, stderr: '', stdout: JSON.stringify(view) });
  };
}

/** Builds the fields that `gh` reports for an issue, as the issue itself and as a blocker of another. */
function toNode(ref: string, issue: FakeIssue): { number: number; state: string; title: string; url: string } {
  const [repository = '', number = ''] = ref.split('#', 2);
  return {
    number: Number(number),
    state: issue.state ?? 'OPEN',
    title: issue.title ?? `Title of ${ref}`,
    url: `https://github.com/${repository}/issues/${number}`,
  };
}

// endregion | Helpers
