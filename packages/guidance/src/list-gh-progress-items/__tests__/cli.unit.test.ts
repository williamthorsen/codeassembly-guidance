import { describe, expect, it } from 'vitest';

import { ProgressItemsFileSchema } from '../../write-progress-report/schemas.ts';
import { type CommandContext, runCli } from '../cli.ts';

const ISSUE = {
  assignees: [],
  body: '',
  closedAt: null,
  closedByPullRequestsReferences: [],
  milestone: null,
  number: 3,
  state: 'OPEN',
  stateReason: '',
  title: 'Export reports',
  url: 'https://github.com/acme/widgets/issues/3',
};

describe(runCli, () => {
  it('writes the issues as a valid items file and reports where', async () => {
    const fake = makeFake([ISSUE, { ...ISSUE, number: 4 }]);

    const result = await runCli(['list', '--out', 'items.json', '--repo', 'acme/widgets'], fake.context);

    expect(result).toStrictEqual({ count: 2, ok: true, path: 'items.json', truncated: false });
    const written = ProgressItemsFileSchema.parse(JSON.parse(fake.written.get('items.json') ?? ''));
    expect(written.items.map(({ id }) => id)).toStrictEqual(['#3', '#4']);
  });

  it('passes the scope to the issue search, with closed issues included', async () => {
    const fake = makeFake([]);

    await runCli(['list', '--out', 'items.json', '--scope', 'label:customer', '--limit', '20'], fake.context);

    expect(fake.calls).toStrictEqual([
      expect.arrayContaining(['issue', 'list', '--state', 'all', '--limit', '21', '--search', 'label:customer']),
    ]);
    expect(fake.calls[0]).not.toContain('--repo');
  });

  it('reports truncation and writes only the limit when more issues match', async () => {
    const fake = makeFake([ISSUE, { ...ISSUE, number: 4 }]);

    const result = await runCli(['list', '--out', 'items.json', '--limit', '1'], fake.context);

    expect(result).toMatchObject({ count: 1, ok: true, truncated: true });
    expect(fake.calls[0]).toEqual(expect.arrayContaining(['--limit', '2']));
  });

  it('does not report truncation when exactly the limit matches', async () => {
    const result = await runCli(['list', '--out', 'items.json', '--limit', '1'], makeFake([ISSUE]).context);

    expect(result).toMatchObject({ count: 1, ok: true, truncated: false });
  });

  it('reports a failed gh call', async () => {
    const context: CommandContext = {
      cwd: '/repo',
      run: () => Promise.reject(new Error('HTTP 401')),
      writeText: () => Promise.resolve(),
    };

    const result = await runCli(['list', '--out', 'items.json'], context);

    expect(result).toMatchObject({ error: 'gh-failed', ok: false });
    expect(result.ok ? '' : result.message).toContain('HTTP 401');
  });

  it.each([
    ['without --out', ['list']],
    ['with a non-positive limit', ['list', '--out', 'items.json', '--limit', '0']],
    ['without the list command', []],
  ])('rejects arguments %s', async (_label, argv) => {
    expect(await runCli(argv, makeFake([]).context)).toMatchObject({ error: 'invalid-args', ok: false });
  });
});

// region | Helpers

/** A context whose `gh` returns `issues`, recording each call's arguments and each written file. */
function makeFake(issues: unknown[]): {
  calls: (readonly string[])[];
  context: CommandContext;
  written: Map<string, string>;
} {
  const calls: (readonly string[])[] = [];
  const written = new Map<string, string>();
  const context: CommandContext = {
    cwd: '/repo',
    run: (_command, args) => {
      calls.push(args);
      return Promise.resolve(JSON.stringify(issues));
    },
    writeText: (path, text) => {
      written.set(path, text);
      return Promise.resolve();
    },
  };
  return { calls, context, written };
}

// endregion | Helpers
