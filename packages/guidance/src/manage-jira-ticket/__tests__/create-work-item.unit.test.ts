import { describe, expect, it } from 'vitest';

import { type AcliResult, type CreateRequest, createWorkItem } from '../create-work-item.ts';

const REQUEST: CreateRequest = {
  adfPath: '/scratch/description.json',
  issueType: 'Task',
  parent: undefined,
  projectKey: 'ABC',
  subtaskIssueType: 'Subtask',
  summary: 'Add the thing',
};

const VIEW_ARGS = ['jira', 'workitem', 'view', 'ABC-1', '--json', '--fields', 'issuetype'];

const CREATE_ARGS = [
  'jira',
  'workitem',
  'create',
  '--project',
  'ABC',
  '--type',
  'Task',
  '--summary',
  'Add the thing',
  '--description-file',
  '/scratch/description.json',
  '--json',
];

describe(createWorkItem, () => {
  it('creates the work item once and reads the key from the JSON output', async () => {
    const acli = fakeAcli({ create: ok('{"key":"ABC-12","id":"10001"}') });

    const outcome = await createWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([CREATE_ARGS]);
    expect(outcome).toEqual({
      diagnostics: [],
      ok: true,
      result: { issueType: 'Task', key: 'ABC-12', parentSkipped: false, rawOutput: '{"key":"ABC-12","id":"10001"}' },
    });
  });

  it('creates a child of an epic with its own issue type', async () => {
    const acli = fakeAcli({ create: ok('{"key":"ABC-13"}'), view: ok(viewOutput(1)) });

    const outcome = await createWorkItem({ ...REQUEST, parent: 'ABC-1' }, acli.run);

    expect(acli.calls).toEqual([VIEW_ARGS, [...CREATE_ARGS, '--parent', 'ABC-1']]);
    expect(outcome.result).toEqual({
      issueType: 'Task',
      key: 'ABC-13',
      parentSkipped: false,
      rawOutput: '{"key":"ABC-13"}',
    });
  });

  it('creates a child of a level-0 parent as a subtask', async () => {
    const acli = fakeAcli({ create: ok('{"key":"ABC-13"}'), view: ok(viewOutput(0)) });

    const outcome = await createWorkItem({ ...REQUEST, parent: 'ABC-1' }, acli.run);

    expect(acli.calls).toEqual([
      VIEW_ARGS,
      [...CREATE_ARGS.map((arg) => (arg === 'Task' ? 'Subtask' : arg)), '--parent', 'ABC-1'],
    ]);
    expect(outcome.result).toMatchObject({ issueType: 'Subtask', parentSkipped: false });
  });

  it('creates the work item without a parent that the pre-flight rejects, and reports the skip', async () => {
    const acli = fakeAcli({ create: ok('{"key":"ABC-14"}'), view: { exitCode: 1, stderr: 'not found', stdout: '' } });

    const outcome = await createWorkItem({ ...REQUEST, parent: 'ABC-1' }, acli.run);

    expect(acli.calls).toEqual([VIEW_ARGS, CREATE_ARGS]);
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toEqual({
      issueType: 'Task',
      key: 'ABC-14',
      parentSkipped: true,
      rawOutput: '{"key":"ABC-14"}',
    });
    expect(outcome.diagnostics).toEqual([expect.stringContaining('parent ABC-1 rejected')]);
  });

  it.each([
    ['not JSON', 'ABC-1: Parent'],
    ['missing the issue type', '{"key":"ABC-1","fields":{}}'],
    ['a level that is not an integer', '{"key":"ABC-1","fields":{"issuetype":{"hierarchyLevel":"0"}}}'],
  ])('skips a parent whose view is %s', async (_label, stdout) => {
    const acli = fakeAcli({ create: ok('{"key":"ABC-17"}'), view: ok(stdout) });

    const outcome = await createWorkItem({ ...REQUEST, parent: 'ABC-1' }, acli.run);

    expect(acli.calls).toEqual([VIEW_ARGS, CREATE_ARGS]);
    expect(outcome.result).toMatchObject({ issueType: 'Task', parentSkipped: true });
    expect(outcome.diagnostics).toEqual([
      expect.stringContaining('could not read the hierarchy level of parent ABC-1'),
    ]);
  });

  it.each([
    ['a subtask', REQUEST, -1],
    ['an initiative', REQUEST, 2],
    ['an umbrella under a level-0 parent', { ...REQUEST, issueType: 'Epic', subtaskIssueType: undefined }, 0],
  ])('skips a parent that cannot take %s', async (_label, request, level) => {
    const acli = fakeAcli({ create: ok('{"key":"ABC-18"}'), view: ok(viewOutput(level)) });

    const outcome = await createWorkItem({ ...request, parent: 'ABC-1' }, acli.run);

    expect(acli.calls[1]).not.toContain('--parent');
    expect(outcome.result).toMatchObject({ issueType: request.issueType, parentSkipped: true });
    expect(outcome.diagnostics).toEqual([expect.stringContaining(`at hierarchy level ${String(level)}`)]);
  });

  it('reports unparseable create output without running the create again', async () => {
    const acli = fakeAcli({ create: ok('✓ Work item ABC-15 created') });

    const outcome = await createWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([CREATE_ARGS]);
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toEqual({
      issueType: 'Task',
      key: null,
      parentSkipped: false,
      rawOutput: '✓ Work item ABC-15 created',
    });
  });

  it('reports JSON output without a top-level key as unparsed', async () => {
    const acli = fakeAcli({ create: ok('{"data":{"key":"ABC-16"}}') });

    const outcome = await createWorkItem(REQUEST, acli.run);

    expect(acli.calls).toHaveLength(1);
    expect(outcome.result.key).toBeNull();
  });

  it('reports a failed create without running it again', async () => {
    const acli = fakeAcli({ create: { exitCode: 2, stderr: 'issue type not found', stdout: '' } });

    const outcome = await createWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([CREATE_ARGS]);
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics).toEqual([expect.stringContaining('issue type not found')]);
  });
});

// region | Helpers

/** Builds an `acli` stand-in that records each call and returns the given results for `view` and `create`. */
function fakeAcli(results: { create: AcliResult; view?: AcliResult }) {
  const calls: string[][] = [];
  function run(args: readonly string[]): Promise<AcliResult> {
    calls.push([...args]);
    const result = args[2] === 'view' ? results.view : results.create;
    if (result === undefined) {
      return Promise.reject(new Error(`unexpected acli call: ${args.join(' ')}`));
    }
    return Promise.resolve(result);
  }
  return { calls, run };
}

/** Builds a successful `acli` result with the given stdout. */
function ok(stdout: string): AcliResult {
  return { exitCode: 0, stderr: '', stdout };
}

/** Builds `acli`'s JSON view of a parent whose issue type is at `hierarchyLevel`. */
function viewOutput(hierarchyLevel: number): string {
  return JSON.stringify({ fields: { issuetype: { hierarchyLevel, name: 'Parent type' } }, key: 'ABC-1' });
}

// endregion | Helpers
