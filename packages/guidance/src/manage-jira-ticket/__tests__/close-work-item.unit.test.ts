import { describe, expect, it } from 'vitest';

import { type CloseRequest, closeWorkItem, readFirstLine } from '../close-work-item.ts';
import { convertMarkdownToAdf } from '../convert-body.ts';
import type { AcliResult } from '../create-work-item.ts';

// The shapes follow `acli`'s JSON output: `comment list --paginate --json` prints one object per page, one after
// another, and gives each body as plain text with collapsed whitespace; `view --json --fields status` nests the status
// category under `fields.status`.
const NO_COMMENTS = JSON.stringify({ comments: [], isLast: true, maxResults: 50, startAt: 0, total: 0 });

const REQUEST: CloseRequest = {
  doneStatus: 'Done',
  key: 'ABC-7',
  post: { adfPath: '/scratch/post.json', firstLine: 'Conclusion of the spike' },
};

const LIST_ARGS = ['jira', 'workitem', 'comment', 'list', '--key', 'ABC-7', '--paginate', '--json'];
const CREATE_ARGS = ['jira', 'workitem', 'comment', 'create', '--key', 'ABC-7', '--body-file', '/scratch/post.json'];
const VIEW_ARGS = ['jira', 'workitem', 'view', 'ABC-7', '--json', '--fields', 'status'];
const TRANSITION_ARGS = ['jira', 'workitem', 'transition', '--key', 'ABC-7', '--status', 'Done', '--yes'];

describe(closeWorkItem, () => {
  it('posts the conclusion and transitions an open work item', async () => {
    const acli = fakeAcli({ list: ok(NO_COMMENTS), view: ok(statusJson('In Progress', 'indeterminate')) });

    const outcome = await closeWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([LIST_ARGS, CREATE_ARGS, VIEW_ARGS, TRANSITION_ARGS]);
    expect(outcome).toEqual({
      ok: true,
      result: {
        posted: 'made',
        status: { category: 'indeterminate', name: 'In Progress' },
        transitioned: 'made',
      },
    });
  });

  it('skips the post when a comment already opens with its first line', async () => {
    const acli = fakeAcli({
      list: ok(commentsJson([' Unrelated note', ' Conclusion of  the spike Each question is answered below.'])),
      view: ok(statusJson('In Progress', 'indeterminate')),
    });

    const outcome = await closeWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([LIST_ARGS, VIEW_ARGS, TRANSITION_ARGS]);
    expect(outcome.result).toMatchObject({ posted: 'skipped', transitioned: 'made' });
  });

  it('reads the comments of every page, including bodies that contain braces and quotes', async () => {
    const pages = `${commentsJson([' Note with {braces} and a \\"quote\\"'])}\n${commentsJson([' Conclusion of the spike'])}\n`;
    const acli = fakeAcli({ list: ok(pages), view: ok(statusJson('Done', 'done')) });

    const outcome = await closeWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([LIST_ARGS, VIEW_ARGS]);
    expect(outcome.result).toMatchObject({ posted: 'skipped', transitioned: 'skipped' });
  });

  it('stops when a page of the comment output cannot be read', async () => {
    const acli = fakeAcli({ list: ok(`${NO_COMMENTS}\nWarning: rate limited\n`) });

    const outcome = await closeWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([LIST_ARGS]);
    expect(outcome.result.error).toBe('could not read the output of acli jira workitem comment list');
  });

  it('skips the transition when the status category is done under another status name', async () => {
    const acli = fakeAcli({ list: ok(NO_COMMENTS), view: ok(statusJson('Resolved', 'done')) });

    const outcome = await closeWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([LIST_ARGS, CREATE_ARGS, VIEW_ARGS]);
    expect(outcome).toEqual({
      ok: true,
      result: { posted: 'made', status: { category: 'done', name: 'Resolved' }, transitioned: 'skipped' },
    });
  });

  it('transitions without reading comments when no post is requested', async () => {
    const acli = fakeAcli({ view: ok(statusJson('To Do', 'new')) });

    const outcome = await closeWorkItem({ ...REQUEST, doneStatus: 'Closed', post: undefined }, acli.run);

    expect(acli.calls).toEqual([
      VIEW_ARGS,
      ['jira', 'workitem', 'transition', '--key', 'ABC-7', '--status', 'Closed', '--yes'],
    ]);
    expect(outcome.result).toMatchObject({ posted: 'not-requested', transitioned: 'made' });
  });

  it('stops before the post when the comments cannot be read', async () => {
    const acli = fakeAcli({ list: { exitCode: 1, stderr: 'not found\n', stdout: '' } });

    const outcome = await closeWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([LIST_ARGS]);
    expect(outcome).toEqual({
      ok: false,
      result: {
        error: 'acli jira workitem comment list exited 1: not found',
        posted: 'not-run',
        status: null,
        transitioned: 'not-run',
      },
    });
  });

  it('stops before the transition when the status output has another shape', async () => {
    const acli = fakeAcli({ list: ok(NO_COMMENTS), view: ok('{"key":"ABC-7"}') });

    const outcome = await closeWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([LIST_ARGS, CREATE_ARGS, VIEW_ARGS]);
    expect(outcome).toEqual({
      ok: false,
      result: {
        error: 'could not read the output of acli jira workitem view',
        posted: 'made',
        status: null,
        transitioned: 'not-run',
      },
    });
  });

  it('does not retry a failed post or go on to the transition', async () => {
    const acli = fakeAcli({ create: { exitCode: 1, stderr: 'timeout', stdout: '' }, list: ok(NO_COMMENTS) });

    const outcome = await closeWorkItem(REQUEST, acli.run);

    expect(acli.calls).toEqual([LIST_ARGS, CREATE_ARGS]);
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toMatchObject({ posted: 'not-run', transitioned: 'not-run' });
    expect(outcome.result.error).toContain('check the work item before posting again');
  });

  it('reports a failed transition after the post was made', async () => {
    const acli = fakeAcli({
      list: ok(NO_COMMENTS),
      transition: { exitCode: 1, stderr: 'no transition to Done', stdout: '' },
      view: ok(statusJson('In Progress', 'indeterminate')),
    });

    const outcome = await closeWorkItem(REQUEST, acli.run);

    expect(outcome.ok).toBe(false);
    expect(outcome.result).toMatchObject({
      error: 'acli jira workitem transition exited 1: no transition to Done',
      posted: 'made',
      transitioned: 'not-run',
    });
  });
});

describe(readFirstLine, () => {
  it('reads the first block as plain text, without its Markdown marks', () => {
    const adf = convertMarkdownToAdf('**Conclusion** of the `spike`\n\nSecond paragraph.\n');

    expect(readFirstLine(adf)).toBe('Conclusion of the spike');
  });

  it('reads a heading or a list item as the first block', () => {
    expect(readFirstLine(convertMarkdownToAdf('## Spike  findings\n\nBody.\n'))).toBe('Spike findings');
    expect(readFirstLine(convertMarkdownToAdf('- first item\n- second item\n'))).toBe('first item second item');
  });

  it('reads a hard break as a space', () => {
    const adf = {
      content: [
        {
          content: [{ text: 'one', type: 'text' }, { type: 'hardBreak' }, { text: 'two', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'doc',
      version: 1,
    };

    expect(readFirstLine(adf)).toBe('one two');
  });

  it('returns an empty string for a document without a block', () => {
    expect(readFirstLine({ content: [], type: 'doc', version: 1 })).toBe('');
  });
});

// region | Helpers

/** Builds `comment list --json` output whose comments have the given plain-text bodies. */
function commentsJson(bodies: readonly string[]): string {
  const comments = bodies.map((body, index) => ({
    author: 'Example User',
    body,
    id: String(10_000 + index),
    visibility: null,
  }));
  return JSON.stringify({ comments, isLast: true, maxResults: 50, startAt: 0, total: comments.length });
}

/** Builds an `acli` stand-in that records each call and returns the result given for its subcommand. */
function fakeAcli(results: { create?: AcliResult; list?: AcliResult; transition?: AcliResult; view?: AcliResult }) {
  const calls: string[][] = [];
  const bySubcommand = new Map<string | undefined, AcliResult | undefined>([
    ['create', results.create ?? ok('{}')],
    ['list', results.list],
    ['transition', results.transition ?? ok('')],
    ['view', results.view],
  ]);
  function run(args: readonly string[]): Promise<AcliResult> {
    calls.push([...args]);
    const result = bySubcommand.get(args[2] === 'comment' ? args[3] : args[2]);
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

/** Builds `view --json --fields status` output for a status and its category key. */
function statusJson(name: string, categoryKey: string): string {
  return JSON.stringify({
    fields: { status: { id: '10001', name, statusCategory: { id: 3, key: categoryKey, name } } },
    key: 'ABC-7',
  });
}

// endregion | Helpers
