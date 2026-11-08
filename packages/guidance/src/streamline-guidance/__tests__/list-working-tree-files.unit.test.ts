import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';
import type { StreamlineGit } from '../git.ts';
import { listWorkingTreeFiles } from '../list-working-tree-files.ts';
import { makeFakeGit } from '../test-utils/make-fake-git.ts';

describe(listWorkingTreeFiles, () => {
  let root: string;

  beforeEach(() => {
    root = makeScratchDir('streamline-list-');
  });

  it("returns git's listing, dropping a listed file deleted from the working tree", async () => {
    for (const file of ['kept.md', 'untracked.md']) {
      await writeFile(path.join(root, file), `${file}\n`, 'utf8');
    }
    const git = makeFakeGit({ files: ['deleted.md', 'kept.md', 'untracked.md'] });

    expect(listWorkingTreeFiles(root, git)).toStrictEqual(['kept.md', 'untracked.md']);
  });

  it('passes the pathspecs to git, defaulting to none', () => {
    const received: Array<readonly string[]> = [];
    const git: StreamlineGit = {
      ...makeFakeGit({}),
      listFiles: (_root, pathspecs) => {
        received.push(pathspecs);
        return [];
      },
    };

    listWorkingTreeFiles(root, git, ['docs']);
    listWorkingTreeFiles(root, git);

    expect(received).toStrictEqual([['docs'], []]);
  });
});
