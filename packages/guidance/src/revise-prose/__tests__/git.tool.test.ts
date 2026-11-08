import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';
import { realGit } from '../git.ts';

describe('realGit', () => {
  let repository: string;

  beforeEach(() => {
    repository = makeScratchDir('revise-prose-git-');
    git('init', '--quiet');
  });

  describe('listFiles', () => {
    beforeEach(async () => {
      await writeFiles({
        '.gitignore': 'ignored.md\n',
        'docs/tracked.md': 'Tracked.\n',
        'docs-other/tracked.md': 'Tracked.\n',
      });
      git('add', '--all');
      commit('seed');
      await writeFiles({ 'docs/untracked.md': 'Untracked.\n', 'ignored.md': 'Ignored.\n' });
    });

    it('lists tracked and untracked files, excluding ignored ones', () => {
      expect(realGit.listFiles(repository, []).toSorted()).toStrictEqual([
        '.gitignore',
        'docs-other/tracked.md',
        'docs/tracked.md',
        'docs/untracked.md',
      ]);
    });

    it('narrows the listing to a file', () => {
      expect(realGit.listFiles(repository, ['docs/untracked.md'])).toStrictEqual(['docs/untracked.md']);
    });

    it('narrows the listing to a directory, without matching a sibling that shares its prefix', () => {
      expect(realGit.listFiles(repository, ['docs']).toSorted()).toStrictEqual([
        'docs/tracked.md',
        'docs/untracked.md',
      ]);
    });

    it('throws outside any repository', () => {
      const outside = makeScratchDir('revise-prose-git-outside-');
      expect(() => realGit.listFiles(outside, [])).toThrow();
    });
  });

  /** Commits the staged changes under the given subject, with automatic maintenance disabled. */
  function commit(subject: string): void {
    git(
      '-c',
      'maintenance.auto=false',
      '-c',
      'gc.auto=0',
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      'commit',
      '--quiet',
      '--message',
      subject,
    );
  }

  /** Runs git in the repository. */
  function git(...args: string[]): void {
    execFileSync('git', ['-C', repository, ...args]);
  }

  /** Writes each file beneath the repository, creating its directories. */
  async function writeFiles(files: Readonly<Record<string, string>>): Promise<void> {
    for (const [file, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(repository, file)), { recursive: true });
      await writeFile(path.join(repository, file), content, 'utf8');
    }
  }
});
