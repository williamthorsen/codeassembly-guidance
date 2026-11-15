import { chmodSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { condenseBranch, type CondenseOptions } from '../condense-branch.ts';
import { type BranchFixture, commitFile, git, makeBranchFixture } from '../test-utils/make-branch-fixture.ts';

const CONSOLIDATION = JSON.stringify({ entries: [{ change: 'guidance|fix: One' }, { change: 'guidance|feat: Two' }] });

describe('condenseBranch', () => {
  let fixture: BranchFixture;
  let options: CondenseOptions;

  beforeEach(() => {
    fixture = makeBranchFixture();
    const messageFile = path.join(fixture.outside, 'message.md');
    const consolidationFile = path.join(fixture.outside, 'consolidation.json');
    writeFileSync(messageFile, 'Condense the branch\n\nBody paragraph.\n');
    writeFileSync(consolidationFile, CONSOLIDATION);
    options = { base: 'main', consolidationFile, cwd: fixture.repo, messageFile };
  });

  it('writes one commit with the original tree on the merge base, and backs up the original head', () => {
    const originalHead = git(fixture.repo, 'rev-parse', 'HEAD');
    const originalTree = git(fixture.repo, 'rev-parse', 'HEAD^{tree}');

    const result = condenseBranch(options);

    expect(result).toStrictEqual({
      backup: 'feature-v1',
      branch: 'feature',
      condensedHead: git(fixture.repo, 'rev-parse', 'feature'),
      mergeBase: fixture.forkPoint,
      originalHead,
      trailers: 2,
    });
    expect(git(fixture.repo, 'rev-parse', 'HEAD^{tree}')).toBe(originalTree);
    expect(git(fixture.repo, 'rev-list', '--parents', '--max-count=1', 'HEAD')).toBe(
      `${result.condensedHead} ${fixture.forkPoint}`,
    );
    expect(git(fixture.repo, 'rev-parse', 'feature-v1')).toBe(originalHead);
    expect(git(fixture.repo, 'log', '--format=%B', '--max-count=1', 'HEAD')).toBe(
      'Condense the branch\n\nBody paragraph.\n\nChange: guidance|fix: One\nChange: guidance|feat: Two',
    );
  });

  it('leaves staged, unstaged, and untracked changes as they were, without stashing', () => {
    writeFileSync(path.join(fixture.repo, 'one.txt'), 'one, staged\n');
    git(fixture.repo, 'add', 'one.txt');
    writeFileSync(path.join(fixture.repo, 'two.txt'), 'two, unstaged\n');
    writeFileSync(path.join(fixture.repo, 'untracked.txt'), 'untracked\n');
    const before = readDirtyState(fixture.repo);

    condenseBranch(options);

    expect(readDirtyState(fixture.repo)).toStrictEqual(before);
    expect(git(fixture.repo, 'stash', 'list')).toBe('');
  });

  it('takes the next free backup version and leaves an existing backup where it was', () => {
    git(fixture.repo, 'branch', 'feature-v1', fixture.forkPoint);
    const originalHead = git(fixture.repo, 'rev-parse', 'HEAD');

    const result = condenseBranch(options);

    expect(result.backup).toBe('feature-v2');
    expect(git(fixture.repo, 'rev-parse', 'feature-v1')).toBe(fixture.forkPoint);
    expect(git(fixture.repo, 'rev-parse', 'feature-v2')).toBe(originalHead);
  });

  it.each([
    ['an absent consolidation file', 'absent.json'],
    ['an empty consolidation file', 'empty.json'],
  ])('writes no trailers for %s', (_label, name) => {
    writeFileSync(path.join(fixture.outside, 'empty.json'), '');

    const result = condenseBranch({ ...options, consolidationFile: path.join(fixture.outside, name) });

    expect(result.trailers).toBe(0);
    expect(git(fixture.repo, 'log', '--format=%B', '--max-count=1', 'HEAD')).toBe(
      'Condense the branch\n\nBody paragraph.',
    );
  });

  it.each<[string, (fixture: BranchFixture, options: CondenseOptions) => CondenseOptions, string]>([
    [
      'a detached HEAD',
      (fixture, options) => {
        git(fixture.repo, 'switch', '--quiet', '--detach');
        return options;
      },
      'HEAD is detached',
    ],
    [
      'a missing message file',
      (fixture, options) => ({ ...options, messageFile: path.join(fixture.outside, 'none') }),
      'message file is missing',
    ],
    [
      'an empty message file',
      (_fixture, options) => {
        writeFileSync(options.messageFile, '\n');
        return options;
      },
      'message file is empty',
    ],
    [
      'a corrupt consolidation record',
      (_fixture, options) => {
        writeFileSync(options.consolidationFile ?? '', '{');
        return options;
      },
      'not valid JSON',
    ],
    [
      'a branch without commits of its own',
      (fixture, options) => {
        git(fixture.repo, 'switch', '--quiet', '--create', 'empty', 'main');
        return options;
      },
      'does not have any commits beyond its merge base',
    ],
    [
      'more than one merge base',
      (fixture, options) => {
        makeCrissCross(fixture.repo);
        return options;
      },
      '2 merge bases',
    ],
    [
      'a branch moved during the run',
      (fixture, options) => {
        installRefTransactionVeto(fixture.repo, 'refs/heads/feature');
        return options;
      },
      'git update-ref failed',
    ],
  ])('refuses %s and leaves every ref as it was', (_label, arrange, message) => {
    const arranged = arrange(fixture, options);
    const refsBefore = git(fixture.repo, 'for-each-ref', '--format=%(refname) %(objectname)');

    expect(() => condenseBranch(arranged)).toThrow(message);
    expect(git(fixture.repo, 'for-each-ref', '--format=%(refname) %(objectname)')).toBe(refsBefore);
  });
});

// region | Helpers

/** Installs a `reference-transaction` hook that aborts every transaction which updates `ref`. */
function installRefTransactionVeto(repo: string, ref: string): void {
  const hookPath = path.join(repo, '.git', 'hooks', 'reference-transaction');
  writeFileSync(hookPath, `#!/bin/sh\n[ "$1" = prepared ] || exit 0\nif grep -q ' ${ref}$'; then exit 1; fi\nexit 0\n`);
  chmodSync(hookPath, 0o755);
}

/** Merges `main` and `feature` into each other from their pre-merge tips, so that the two have two merge bases. */
function makeCrissCross(repo: string): void {
  const featureTip = git(repo, 'rev-parse', 'feature');
  git(repo, 'switch', '--quiet', 'main');
  commitFile(repo, 'main.txt', 'main\n', 'Change main');
  const mainTip = git(repo, 'rev-parse', 'main');
  git(repo, 'merge', '--quiet', '--no-ff', '--no-edit', featureTip);
  git(repo, 'switch', '--quiet', 'feature');
  git(repo, 'merge', '--quiet', '--no-ff', '--no-edit', mainTip);
}

/** Returns the unstaged diff, the staged diff, and the porcelain status that lists every untracked file. */
function readDirtyState(repo: string): string[] {
  return [
    git(repo, 'diff'),
    git(repo, 'diff', '--cached'),
    git(repo, 'status', '--porcelain=v1', '--untracked-files=all'),
  ];
}

// endregion | Helpers
