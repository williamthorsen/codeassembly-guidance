import { existsSync } from 'node:fs';

import { beforeEach, describe, expect, it } from 'vitest';

import { makeScratchDir } from '../make-scratch-dir.ts';

describe(makeScratchDir, () => {
  const created: string[] = [];

  it('creates a directory that exists during the test', () => {
    const dir = makeScratchDir('make-scratch-dir-');
    created.push(dir);

    expect(existsSync(dir)).toBe(true);
  });

  it('has removed the directory of the previous test', () => {
    expect(created).toHaveLength(1);
    expect(existsSync(created[0] ?? '')).toBe(false);
  });

  it.fails('fails after creating a directory', () => {
    created.push(makeScratchDir('make-scratch-dir-failed-'));
    throw new Error('deliberate failure');
  });

  it('has removed the directory of the failed test', () => {
    expect(existsSync(created[1] ?? '')).toBe(false);
  });

  describe('from beforeEach', () => {
    let dir = '';

    beforeEach(() => {
      dir = makeScratchDir('make-scratch-dir-each-');
      created.push(dir);
    });

    it('creates the directory before the test', () => {
      expect(existsSync(dir)).toBe(true);
    });

    it('has removed the directory created for the previous test', () => {
      expect(existsSync(created[2] ?? '')).toBe(false);
    });
  });
});
