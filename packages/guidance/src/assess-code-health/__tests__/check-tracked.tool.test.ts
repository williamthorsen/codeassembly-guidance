import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';
import { realTrackedDependencies } from '../check-tracked.ts';

describe('realTrackedDependencies.changedSince', () => {
  let scratch: string;
  let first: string;

  beforeEach(() => {
    scratch = makeScratchDir('code-health-tracked-');
    git('init', '--quiet', '--initial-branch=main');
    writeFileSync(path.join(scratch, 'a.ts'), 'one\n');
    writeFileSync(path.join(scratch, 'b.ts'), 'one\n');
    git('add', '--all');
    git('commit', '--quiet', '--message', 'first');
    first = git('rev-parse', 'HEAD').trim();
    writeFileSync(path.join(scratch, 'b.ts'), 'two\n');
    git('commit', '--quiet', '--all', '--message', 'second');
  });

  it('reports whether a path changed after the commit', () => {
    expect(realTrackedDependencies.changedSince(scratch, first, ['a.ts'])).toBe(false);
    expect(realTrackedDependencies.changedSince(scratch, first, ['a.ts', 'b.ts'])).toBe(true);
  });

  it('returns undefined for a commit that the repository does not have', () => {
    expect(realTrackedDependencies.changedSince(scratch, 'f'.repeat(40), ['a.ts'])).toBeUndefined();
  });

  /** Runs git in the scratch repository with a fixed author, returning its stdout. */
  function git(...args: string[]): string {
    return execFileSync('git', ['-C', scratch, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', ...args], {
      encoding: 'utf8',
    });
  }
});
