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

describe(formatRefusalSummary, () => {
  it('names the PR when its number is known, and the PR alone otherwise', () => {
    expect(formatRefusalSummary(42, 'Body file missing or empty: /tmp/body.md')).toBe(
      '---\n\n## ❌ Did not merge PR #42\n\nBody file missing or empty: /tmp/body.md',
    );
    expect(formatRefusalSummary(undefined, '--pr is required')).toBe(
      '---\n\n## ❌ Did not merge the PR\n\n--pr is required',
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
      summary: '---\n\n## ❌ Did not merge PR #42\n\nGraphQL: Pull request is not mergeable',
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
        '---\n\n## ❌ Did not merge PR #42\n\n' +
        'PR #42 is OPEN after the merge command, so a merge queue may hold it. The branch was not deleted.',
    });
    expect(gh.calls.some((args) => args[0] === 'api')).toBe(false);
  });

  it('fails without deleting when the post-merge view cannot be parsed', async () => {
    const gh = makeFakeGh({ view: ok('not json') });

    const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

    expect(outcome).toMatchObject({
      ok: false,
      summary:
        '---\n\n## ⚠️ Could not confirm the merge of PR #42\n\n' +
        "The merge command succeeded, but the PR's state could not be read. The branch was not deleted.",
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
        '---\n\n## ⚠️ Could not confirm the merge of PR #42\n\n' +
        "The merge command succeeded, but the PR's state could not be read. The branch was not deleted.\n\n" +
        'gh: Bad gateway (HTTP 502)',
    });
  });

  describe('summary', () => {
    it.each([
      ['deleted', 'remote', undefined, '🗑️ Deleted remote branch feature/cache'],
      [
        'already-deleted',
        'remote',
        fail('gh: Reference does not exist (HTTP 422)\n'),
        '🗑️ Remote branch feature/cache was already deleted',
      ],
      ['by-gh', 'both', undefined, '🗑️ Deleted local and remote branch feature/cache'],
      ['not-requested', 'none', undefined, '⏸️ Kept branch feature/cache'],
      [
        'failed',
        'remote',
        fail('gh: Server Error (HTTP 500)\n'),
        '⚠️ Did not delete remote branch feature/cache: gh: Server Error (HTTP 500)',
      ],
    ] as const)('reports a %s deletion on its own line', async (_branchDeletion, deletionStrategy, api, line) => {
      const gh = makeFakeGh(api === undefined ? {} : { api });

      const outcome = await mergePullRequest({ ...SQUASH_REQUEST, deletionStrategy }, gh.run);

      expect(outcome).toMatchObject({
        ok: true,
        result: {
          summary: `---\n\n## 🔀 Merged PR #42 into main\n\n${line}\nsquash · abc1234 · https://github.com/acme/widgets/pull/42`,
        },
      });
    });

    it('omits the base branch from the heading when the view does not name it', async () => {
      const gh = makeFakeGh({ view: ok(JSON.stringify({ ...MERGED_VIEW, baseRefName: undefined })) });

      const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(outcome.ok && outcome.result.summary.split('\n', 3)[2]).toBe('## 🔀 Merged PR #42');
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
            '---\n\n## 🔀 Merged PR #42 into main\n\n' +
            '🗑️ Deleted remote branch feature/cache\nsquash · abc1234 · https://github.com/acme/widgets/pull/42',
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
      expect(gh.calls.some((args) => args[0] === 'api')).toBe(false);
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

    it('leaves deletion to gh for both, and skips it for none', async () => {
      const both = makeFakeGh();
      const none = makeFakeGh();

      const bothOutcome = await mergePullRequest({ ...SQUASH_REQUEST, deletionStrategy: 'both' }, both.run);
      const noneOutcome = await mergePullRequest({ ...SQUASH_REQUEST, deletionStrategy: 'none' }, none.run);

      expect(bothOutcome).toMatchObject({ result: { branchDeletion: 'by-gh' } });
      expect(noneOutcome).toMatchObject({ result: { branchDeletion: 'not-requested' } });
      expect([...both.calls, ...none.calls].some((args) => args[0] === 'api')).toBe(false);
    });
  });
});

// region | Helpers

interface FakeGhResponses {
  api?: GhResult;
  merge?: GhResult;
  view?: GhResult;
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
      if (args[0] === 'api') {
        return Promise.resolve(responses.api ?? ok(''));
      }
      if (args[1] === 'merge') {
        return Promise.resolve(responses.merge ?? ok(''));
      }
      return Promise.resolve(responses.view ?? ok(JSON.stringify(MERGED_VIEW)));
    },
  };
}

/** Returns a successful `gh` result with the given stdout. */
function ok(stdout: string): GhResult {
  return { exitCode: 0, stderr: '', stdout };
}

// endregion | Helpers
