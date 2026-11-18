import { describe, expect, it } from 'vitest';

import { type CommandContext, runCli } from '../cli.ts';

const VALID_ITEM = {
  closed: true,
  completed: true,
  completedOn: '2026-11-02',
  description: null,
  id: '#1',
  neededBy: null,
  needsInput: false,
  sources: ['https://tracker.example/1'],
  started: true,
  targetOn: null,
  title: 'Ship the export',
  workstream: null,
};

describe(runCli, () => {
  it('assembles the report from the items file', async () => {
    const result = await runCli(['assemble', '--items', 'items.json'], makeContext({ items: [VALID_ITEM] }));

    expect(result).toMatchObject({ lastUpdated: '2026-11-18', ok: true, period: null });
    expect('sections' in result ? result.sections.map(({ rows }) => rows.length) : []).toStrictEqual([1]);
  });

  it('ends an open period at --today, and at the context date without it', async () => {
    const context = makeContext({ items: [VALID_ITEM] });

    const explicit = await runCli(
      ['assemble', '--items', 'items.json', '--period', '2026-11-01', '--today', '2026-11-05'],
      context,
    );
    const implicit = await runCli(['assemble', '--items', 'items.json', '--period', '2026-11-01'], context);

    expect(explicit).toMatchObject({ ok: true, period: { end: '2026-11-05', start: '2026-11-01' } });
    expect(implicit).toMatchObject({ ok: true, period: { end: '2026-11-18', start: '2026-11-01' } });
  });

  it.each([
    ['a start-less period', '..2026-11-30'],
    ['an impossible date', '2026-02-30'],
    ['a reversed period', '2026-11-30..2026-11-01'],
  ])('rejects %s', async (_label, period) => {
    const result = await runCli(['assemble', '--items', 'items.json', '--period', period], makeContext({ items: [] }));

    expect(result).toMatchObject({ error: 'invalid-args', ok: false });
  });

  it('names the item and the field of a contract violation', async () => {
    const result = await runCli(
      ['assemble', '--items', 'items.json'],
      makeContext({ items: [VALID_ITEM, { ...VALID_ITEM, completedOn: '2026-13-01' }] }),
    );

    expect(result).toMatchObject({ error: 'invalid-items', ok: false });
    expect(result.ok ? '' : result.message).toContain('items.1.completedOn');
  });

  it('rejects a completed item without a completion date', async () => {
    const result = await runCli(
      ['assemble', '--items', 'items.json'],
      makeContext({ items: [{ ...VALID_ITEM, completedOn: null }] }),
    );

    expect(result).toMatchObject({ error: 'invalid-items', ok: false });
    expect(result.ok ? '' : result.message).toContain('items.0.completedOn: a completed item requires completedOn');
  });

  it('rejects a field that the contract does not define', async () => {
    const result = await runCli(
      ['assemble', '--items', 'items.json'],
      makeContext({ items: [{ ...VALID_ITEM, status: 'done' }] }),
    );

    expect(result).toMatchObject({ error: 'invalid-items', ok: false });
    expect(result.ok ? '' : result.message).toContain('status');
  });

  it('reports a file that is not JSON', async () => {
    const context: CommandContext = { readText: () => Promise.resolve('not json'), today: '2026-11-18' };

    const result = await runCli(['assemble', '--items', 'items.json'], context);

    expect(result).toMatchObject({ error: 'invalid-items', ok: false });
  });

  it('requires --items and the assemble command', async () => {
    const context = makeContext({ items: [] });

    expect(await runCli(['assemble'], context)).toMatchObject({ error: 'invalid-args', ok: false });
    expect(await runCli(['report', '--items', 'items.json'], context)).toMatchObject({
      error: 'invalid-args',
      ok: false,
    });
  });
});

describe('runCli render', () => {
  const assembled = {
    lastUpdated: '2026-11-18',
    ok: true,
    period: null,
    sections: [
      {
        rows: [{ date: 'Done: 2026-11-02', dateOn: '2026-11-02', id: '#1', label: 'Done', status: 'done' }],
        workstream: null,
      },
    ],
  };
  const text = {
    sections: [
      {
        heading: 'Invoicing',
        health: 'on-track',
        rows: [{ details: 'See [the ticket](https://tracker.example/1).', id: '#1', workItem: 'Export' }],
        workstream: null,
      },
    ],
  };

  it('renders Markdown by default', async () => {
    const result = await runCli(
      ['render', '--assembled', 'a.json', '--text', 't.json'],
      makeFiles({ 'a.json': assembled, 't.json': text }),
    );

    expect(result).toMatchObject({ format: 'markdown', ok: true });
    expect(result.ok && 'text' in result ? result.text : '').toContain('| Export | ✅ Done | Done: 2026-11-02 |');
  });

  it('renders Confluence storage format under --format confluence', async () => {
    const result = await runCli(
      ['render', '--assembled', 'a.json', '--text', 't.json', '--format', 'confluence'],
      makeFiles({ 'a.json': assembled, 't.json': text }),
    );

    expect(result).toMatchObject({ format: 'confluence', ok: true });
    expect(result.ok && 'text' in result ? result.text : '').toContain('<td>Done: <time datetime="2026-11-02" /></td>');
  });

  it('checks the links against every --internal-host', async () => {
    const result = await runCli(
      [
        'render',
        '--assembled',
        'a.json',
        '--text',
        't.json',
        '--internal-host',
        'chat.example',
        '--internal-host',
        'tracker.example',
      ],
      makeFiles({ 'a.json': assembled, 't.json': text }),
    );

    expect(result).toMatchObject({ error: 'invalid-text', ok: false });
    expect(result.ok ? '' : result.message).toContain('internal host tracker.example');
  });

  it('rejects a format that it does not write, and a text file of the wrong shape', async () => {
    const files = makeFiles({ 'a.json': assembled, 't.json': { sections: [{ heading: 'x' }] } });

    expect(
      await runCli(['render', '--assembled', 'a.json', '--text', 't.json', '--format', 'pdf'], files),
    ).toStrictEqual({
      error: 'invalid-args',
      message: '--format must be one of confluence, markdown, got "pdf"',
      ok: false,
    });
    expect(await runCli(['render', '--assembled', 'a.json', '--text', 't.json'], files)).toMatchObject({
      error: 'invalid-input',
      ok: false,
    });
  });
});

// region | Helpers

/** Builds a context whose every read returns `file` as JSON, on 2026-11-18. */
function makeContext(file: unknown): CommandContext {
  return { readText: () => Promise.resolve(JSON.stringify(file)), today: '2026-11-18' };
}

/** Builds a context that reads each path in `files` as JSON. */
function makeFiles(files: Record<string, unknown>): CommandContext {
  return {
    readText: (path) => {
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(JSON.stringify(content));
    },
    today: '2026-11-18',
  };
}

// endregion | Helpers
