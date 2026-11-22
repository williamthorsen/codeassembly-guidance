import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';
import { deriveSessionContext } from '../cli.ts';

const NOW = new Date('2026-11-22T17:00:00Z');

describe('diff base in a repository with two worktrees', () => {
  let mainDir: string;
  let pieceDir: string;

  beforeEach(() => {
    const root = makeScratchDir('derive-session-context-diff-base-tool-');
    mainDir = path.join(root, 'repo');
    pieceDir = path.join(root, 'piece');
    runGit(root, ['init', '--quiet', '--initial-branch=main', mainDir]);
    runGit(mainDir, [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--quiet',
      '--allow-empty',
      '-m',
      'init',
    ]);
    runGit(mainDir, ['branch', '13-second-piece']);
  });

  it('reads from a later worktree the diff base that another worktree stored', async () => {
    await deriveSessionContext({
      cwd: mainDir,
      branch: '13-second-piece',
      now: NOW,
      home: mainDir,
      diffBaseMutation: { value: '12-first-piece' },
    });
    runGit(mainDir, ['worktree', 'add', '--quiet', pieceDir, '13-second-piece']);

    const manifest = await deriveSessionContext({ cwd: pieceDir, branch: '13-second-piece', now: NOW, home: pieceDir });

    expect(manifest.diff_base).toBe('12-first-piece');
  });

  it('clears a diff base that is not set without failing', async () => {
    const manifest = await deriveSessionContext({
      cwd: mainDir,
      branch: '13-second-piece',
      now: NOW,
      home: mainDir,
      diffBaseMutation: { value: null },
    });

    expect(manifest.diff_base).toBeNull();
  });
});

// region | Helpers

/** Runs git in `cwd`, failing the test on a non-zero exit. */
function runGit(cwd: string, args: readonly string[]): void {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' });
}

// endregion | Helpers
