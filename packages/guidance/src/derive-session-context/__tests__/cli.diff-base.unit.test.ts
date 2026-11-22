import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { captureStdio } from '@williamthorsen/toolbelt.testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeFakeGit } from '../../test-utils/make-fake-git.ts';
import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';
import { deriveSessionContext } from '../cli.ts';

const NOW = new Date('2026-11-22T17:00:00Z');

const PIECE_KEY = 'branch.13-second-piece.codeassemblyDiffBase';

describe('diff base', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = makeScratchDir('derive-session-context-diff-base-');
    await mkdir(path.join(workDir, '.agents'), { recursive: true });
    await writeFile(path.join(workDir, '.agents', 'preferences.yaml'), 'project:\n  slug: my-project\n');
  });

  it('stores the diff base in the branch config key and emits it', async () => {
    const config = new Map<string, string>();
    const git = makeFakeGit({ config });

    const manifest = await derive(git, '13-second-piece', { value: '12-first-piece' });

    expect(config.get(PIECE_KEY)).toBe('12-first-piece');
    expect(manifest.diff_base).toBe('12-first-piece');
  });

  it('emits a stored diff base without a mutation, and null once it is cleared', async () => {
    const config = new Map([[PIECE_KEY, '12-first-piece']]);
    const git = makeFakeGit({ config });

    expect((await derive(git, '13-second-piece')).diff_base).toBe('12-first-piece');
    expect((await derive(git, '13-second-piece', { value: null })).diff_base).toBeNull();
    expect(config.has(PIECE_KEY)).toBe(false);
  });

  it('refuses to store a diff base on the default branch and reports it', async () => {
    const config = new Map<string, string>();
    const git = makeFakeGit({ config });

    using stdio = captureStdio();
    const manifest = await derive(git, 'main', { value: '12-first-piece' });

    expect(manifest.diff_base).toBeNull();
    expect(config.size).toBe(0);
    expect(stdio.stderr).toContain('refusing to store diff_base on default branch main');
  });

  it('emits null when git fails to read the config', async () => {
    const git = makeFakeGit({ errors: { readConfig: new Error('fatal: bad config') } });

    expect((await derive(git, '13-second-piece')).diff_base).toBeNull();
  });

  // region | Helpers

  /** Derives the manifest for `branch` in the scratch directory, applying an optional diff-base mutation. */
  function derive(git: ReturnType<typeof makeFakeGit>, branch: string, diffBaseMutation?: { value: string | null }) {
    return deriveSessionContext({
      git,
      cwd: workDir,
      branch,
      now: NOW,
      home: workDir,
      ...(diffBaseMutation !== undefined && { diffBaseMutation }),
    });
  }

  // endregion | Helpers
});
