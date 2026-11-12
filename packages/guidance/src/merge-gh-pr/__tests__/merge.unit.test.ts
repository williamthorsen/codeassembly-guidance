import { describe, expect, it } from 'vitest';

import { formatRefusalSummary, type GhResult, mergePullRequest, type MergeRequest } from '../merge.ts';

const MERGED_VIEW = {
  state: 'MERGED',
  mergeCommit: { oid: 'abc1234def' },
  url: 'https://github.com/acme/widgets/pull/42',
  mergedAt: '2026-09-28T22:00:00Z',
  baseRefName: 'main',
  headRefName: 'feature/cache',
  headRepository: { name: 'widgets' },
  headRepositoryOwner: { login: 'acme' },
};

const SQUASH_REQUEST: MergeRequest = {
  bodyPath: '/tmp/body.md',
  deletionStrategy: 'remote',
  prNumber: 42,
  strategy: 'squash',
  title: 'agents|feat: Add cache',
};

const MERGED_SUBJECT = 'agents|feat: Add cache (#42)';

describe(formatRefusalSummary, () => {
  it('names the PR when a reference is known, and omits the PR line otherwise', () => {
    expect(formatRefusalSummary('#42', 'Body file missing or empty: /tmp/body.md')).toBe(
      '---\n\n## ❌ Not merged\n\nPR: #42\nReason: Body file missing or empty: /tmp/body.md',
    );
    expect(formatRefusalSummary(undefined, '--pr is required')).toBe(
      '---\n\n## ❌ Not merged\n\nReason: --pr is required',
    );
  });

  it('keeps a multi-line reason inside the block by removing its blank lines', () => {
    expect(formatRefusalSummary('#42', '\nfirst line\n\n  \nsecond line\n')).toBe(
      '---\n\n## ❌ Not merged\n\nPR: #42\nReason: first line\nsecond line',
    );
  });
});

describe(mergePullRequest, () => {
  describe('merge arguments', () => {
    it('passes the subject and body file without a deletion flag for a squash with remote deletion', async () => {
      const gh = makeFakeGh();

      await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(gh.calls[0]).toEqual([
        'pr',
        'merge',
        '42',
        '--squash',
        '--subject',
        'agents|feat: Add cache',
        '--body-file',
        '/tmp/body.md',
      ]);
    });

    it('omits the subject for a merge commit and adds --delete-branch for both', async () => {
      const gh = makeFakeGh();

      await mergePullRequest({ ...SQUASH_REQUEST, deletionStrategy: 'both', strategy: 'merge' }, gh.run);

      expect(gh.calls[0]).toEqual(['pr', 'merge', '42', '--merge', '--body-file', '/tmp/body.md', '--delete-branch']);
    });

    it('omits the subject and body file for a rebase', async () => {
      const gh = makeFakeGh();

      await mergePullRequest({ ...SQUASH_REQUEST, deletionStrategy: 'none', strategy: 'rebase' }, gh.run);

      expect(gh.calls[0]).toEqual(['pr', 'merge', '42', '--rebase']);
    });
  });

  it('returns the merge failure with gh stderr and exit code, and runs nothing after it', async () => {
    const gh = makeFakeGh({ merge: { exitCode: 1, stderr: 'GraphQL: Pull request is not mergeable\n', stdout: '' } });

    const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

    expect(outcome).toEqual({
      ok: false,
      exitCode: 1,
      stderr: 'GraphQL: Pull request is not mergeable\n',
      summary: '---\n\n## ❌ Not merged\n\nPR: #42\nReason: GraphQL: Pull request is not mergeable',
    });
    expect(gh.calls).toHaveLength(1);
  });

  it('fails without deleting when the PR is not MERGED after gh reports success', async () => {
    const gh = makeFakeGh({ view: ok(JSON.stringify({ ...MERGED_VIEW, state: 'OPEN', mergeCommit: null })) });

    const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

    expect(outcome).toEqual({
      ok: false,
      exitCode: 1,
      stderr: 'PR #42 is OPEN after merge; branch not deleted.\n',
      summary:
        '---\n\n## ❌ Not merged\n\nPR: https://github.com/acme/widgets/pull/42\n' +
        'Reason: PR #42 is OPEN after the merge command, so a merge queue may hold it. The branch was not deleted.',
    });
    expect(gh.calls.some((args) => args[0] === 'api')).toBe(false);
  });

  it('fails without deleting when the post-merge view cannot be parsed', async () => {
    const gh = makeFakeGh({ view: ok('not json') });

    const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

    expect(outcome).toMatchObject({
      ok: false,
      summary:
        '---\n\n## ⚠️ Merge not confirmed\n\nPR: #42\n' +
        "Reason: The merge command succeeded, but the PR's state could not be read. The branch was not deleted.",
    });
    expect(gh.calls.some((args) => args[0] === 'api')).toBe(false);
  });

  it('reports an unconfirmed merge with the view diagnostic when the post-merge view fails', async () => {
    const gh = makeFakeGh({ view: fail('gh: Bad gateway (HTTP 502)\n') });

    const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

    expect(outcome).toMatchObject({
      ok: false,
      exitCode: 1,
      summary:
        '---\n\n## ⚠️ Merge not confirmed\n\nPR: #42\n' +
        "Reason: The merge command succeeded, but the PR's state could not be read. The branch was not deleted.\n" +
        'gh: Bad gateway (HTTP 502)',
    });
  });

  it('reports an unconfirmed merge when the post-merge view throws', async () => {
    const gh = makeFakeGh({ view: new Error('stdout maxBuffer length exceeded') });

    const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

    expect(outcome).toMatchObject({
      ok: false,
      exitCode: 1,
      summary: expect.stringContaining('## ⚠️ Merge not confirmed'),
    });
    expect(outcome.ok || outcome.summary).toContain('stdout maxBuffer length exceeded');
  });

  describe('summary', () => {
    it.each([
      ['deleted', 'remote', undefined, 'Remote branch feature/cache: 🗑️ Deleted'],
      [
        'already-deleted',
        'remote',
        fail('gh: Reference does not exist (HTTP 422)\n'),
        'Remote branch feature/cache: 🗑️ Already deleted',
      ],
      ['by-gh', 'both', undefined, 'Local and remote branch feature/cache: 🗑️ Deleted'],
      ['not-requested', 'none', undefined, 'Remote branch feature/cache: ⏸️ Kept'],
      [
        'failed',
        'remote',
        fail('gh: Server Error (HTTP 500)\n'),
        'Remote branch feature/cache: ⚠️ Not deleted: gh: Server Error (HTTP 500)',
      ],
    ] as const)('reports a %s deletion on the branch line', async (_branchDeletion, deletionStrategy, api, line) => {
      const gh = makeFakeGh(api === undefined ? {} : { api });

      const outcome = await mergePullRequest({ ...SQUASH_REQUEST, deletionStrategy }, gh.run);

      expect(outcome).toMatchObject({
        ok: true,
        result: {
          summary:
            '---\n\n## 🔀 Merged into main · squash · abc1234\n\n' +
            `Commit title: ${MERGED_SUBJECT}\nPR: https://github.com/acme/widgets/pull/42\n${line}`,
        },
      });
    });

    it.each([
      ['merge', '## 🔀 Merged into main · merge commit · abc1234', 'Commit title:'],
      ['rebase', '## 🔀 Merged into main · rebase · abc1234', 'Last commit title:'],
    ] as const)('names the %s strategy and labels its commit title', async (strategy, heading, label) => {
      const gh = makeFakeGh();

      const outcome = await mergePullRequest({ ...SQUASH_REQUEST, strategy }, gh.run);

      const lines = outcome.ok ? outcome.result.summary.split('\n') : [];
      expect(lines[2]).toBe(heading);
      expect(lines[4]).toBe(`${label} ${MERGED_SUBJECT}`);
    });

    it('reads the subject of the merge commit, keeping only its first line', async () => {
      const gh = makeFakeGh({ commit: ok(`${MERGED_SUBJECT}\n\nBody line.\n`) });

      const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(gh.calls).toContainEqual(['api', 'repos/{owner}/{repo}/commits/abc1234def', '--jq', '.commit.message']);
      expect(outcome).toMatchObject({ ok: true, warnings: [] });
      expect(outcome.ok && outcome.result.summary).toContain(`\nCommit title: ${MERGED_SUBJECT}\n`);
    });

    it.each([
      ['fails', fail('gh: Not Found (HTTP 404)\n'), 'gh: Not Found (HTTP 404)'],
      ['returns an empty message', ok('\n'), 'empty commit message'],
      ['throws', new Error('gh was killed by SIGTERM'), 'gh was killed by SIGTERM'],
    ] as const)('falls back to the submitted title and warns when the read %s', async (_case, commit, reason) => {
      const gh = makeFakeGh({ commit });

      const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(outcome).toMatchObject({
        ok: true,
        warnings: [`warning: Could not read the subject of merge commit abc1234def: ${reason}`],
      });
      expect(outcome.ok && outcome.result.summary).toContain('\nCommit title: agents|feat: Add cache\n');
    });

    it('shows the commit title as unavailable when the read fails and no title was submitted', async () => {
      const gh = makeFakeGh({ commit: fail('gh: Not Found (HTTP 404)\n') });

      const outcome = await mergePullRequest({ ...SQUASH_REQUEST, strategy: 'rebase', title: undefined }, gh.run);

      expect(outcome.ok && outcome.result.summary).toContain('\nLast commit title: unavailable\n');
    });

    it('omits the base branch from the heading when the view does not name it', async () => {
      const gh = makeFakeGh({ view: ok(JSON.stringify({ ...MERGED_VIEW, baseRefName: undefined })) });

      const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(outcome.ok && outcome.result.summary.split('\n', 3)[2]).toBe('## 🔀 Merged · squash · abc1234');
    });
  });

  describe('branch deletion', () => {
    it('deletes the head ref on the head repo and reports the merge result', async () => {
      const gh = makeFakeGh();

      const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(gh.calls[2]).toEqual(['api', '-X', 'DELETE', 'repos/acme/widgets/git/refs/heads/feature/cache']);
      expect(outcome).toEqual({
        ok: true,
        result: {
          branchDeletion: 'deleted',
          headRefName: 'feature/cache',
          mergeCommit: { oid: 'abc1234def' },
          mergedAt: '2026-09-28T22:00:00Z',
          summary:
            '---\n\n## 🔀 Merged into main · squash · abc1234\n\n' +
            `Commit title: ${MERGED_SUBJECT}\n` +
            'PR: https://github.com/acme/widgets/pull/42\n' +
            'Remote branch feature/cache: 🗑️ Deleted',
          url: 'https://github.com/acme/widgets/pull/42',
        },
        warnings: [],
      });
    });

    it('targets the fork for a cross-repo PR', async () => {
      const view = { ...MERGED_VIEW, headRepository: { name: 'widgets-fork' }, headRepositoryOwner: { login: 'dana' } };
      const gh = makeFakeGh({ view: ok(JSON.stringify(view)) });

      await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(gh.calls[2]).toEqual(['api', '-X', 'DELETE', 'repos/dana/widgets-fork/git/refs/heads/feature/cache']);
    });

    it('reports a ref that no longer exists as already deleted', async () => {
      const gh = makeFakeGh({ api: fail('gh: Reference does not exist (HTTP 422)\n') });

      const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(outcome).toMatchObject({ ok: true, result: { branchDeletion: 'already-deleted' }, warnings: [] });
    });

    it('reports a deleted fork as already deleted without calling the API', async () => {
      const view = { ...MERGED_VIEW, headRepository: null, headRepositoryOwner: null };
      const gh = makeFakeGh({ view: ok(JSON.stringify(view)) });

      const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(outcome).toMatchObject({ ok: true, result: { branchDeletion: 'already-deleted' } });
      expect(gh.calls.some(isDeleteCall)).toBe(false);
    });

    it('warns on any other deletion failure and still reports the merge as successful', async () => {
      const gh = makeFakeGh({ api: fail('gh: Resource not accessible by integration (HTTP 403)\n') });

      const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(outcome).toMatchObject({
        ok: true,
        result: { branchDeletion: 'failed', mergeCommit: { oid: 'abc1234def' } },
        warnings: [
          "warning: Failed to delete remote branch 'feature/cache': gh: Resource not accessible by integration (HTTP 403)",
        ],
      });
    });

    it('reports a deletion whose gh call throws as failed, and the merge as successful', async () => {
      const gh = makeFakeGh({ api: new Error('gh was killed by SIGTERM') });

      const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(outcome).toMatchObject({
        ok: true,
        result: {
          branchDeletion: 'failed',
          summary: expect.stringContaining('Remote branch feature/cache: ⚠️ Not deleted: gh was killed by SIGTERM'),
        },
      });
    });

    it('leaves deletion to gh for both, and skips it for none', async () => {
      const both = makeFakeGh();
      const none = makeFakeGh();

      const bothOutcome = await mergePullRequest({ ...SQUASH_REQUEST, deletionStrategy: 'both' }, both.run);
      const noneOutcome = await mergePullRequest({ ...SQUASH_REQUEST, deletionStrategy: 'none' }, none.run);

      expect(bothOutcome).toMatchObject({ result: { branchDeletion: 'by-gh' } });
      expect(noneOutcome).toMatchObject({ result: { branchDeletion: 'not-requested' } });
      expect([...both.calls, ...none.calls].some(isDeleteCall)).toBe(false);
    });
  });
});

// region | Helpers

/**
 * A canned response per call; `api` answers the branch deletion and `commit` the commit read. An `Error` makes the
 * runner throw it.
 */
interface FakeGhResponses {
  api?: Error | GhResult;
  commit?: Error | GhResult;
  merge?: Error | GhResult;
  view?: Error | GhResult;
}

/** Returns true for the `gh api -X DELETE` call that deletes the head branch. */
function isDeleteCall(args: readonly string[]): boolean {
  return args[0] === 'api' && args[1] === '-X';
}

/** Returns a failed `gh` result with the given stderr. */
function fail(stderr: string): GhResult {
  return { exitCode: 1, stderr, stdout: '' };
}

/** Returns a `gh` runner that responds by subcommand and records every argument array that it receives. */
function makeFakeGh(responses: FakeGhResponses = {}): {
  calls: string[][];
  run: (args: readonly string[]) => Promise<GhResult>;
} {
  const calls: string[][] = [];
  return {
    calls,
    run: (args) => {
      calls.push([...args]);
      if (isDeleteCall(args)) {
        return respond(responses.api ?? ok(''));
      }
      if (args[0] === 'api') {
        return respond(responses.commit ?? ok(`${MERGED_SUBJECT}\n`));
      }
      if (args[1] === 'merge') {
        return respond(responses.merge ?? ok(''));
      }
      return respond(responses.view ?? ok(JSON.stringify(MERGED_VIEW)));
    },
  };
}

/** Resolves to the result, or rejects with the error. */
function respond(response: Error | GhResult): Promise<GhResult> {
  return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
}

/** Returns a successful `gh` result with the given stdout. */
function ok(stdout: string): GhResult {
  return { exitCode: 0, stderr: '', stdout };
}

// endregion | Helpers
