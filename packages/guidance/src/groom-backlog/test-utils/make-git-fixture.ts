import { execFileSync } from 'node:child_process';

import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';

const FIXED_CONFIG = [
  '-c',
  'gc.auto=0',
  '-c',
  'maintenance.auto=false',
  '-c',
  'user.email=test@example.com',
  '-c',
  'user.name=Test',
];

/**
 * Runs git in `cwd` with a fixed identity and automatic maintenance disabled, whose background run can outlive the
 * fixture's directory, and returns its trimmed stdout.
 */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', [...FIXED_CONFIG, ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

/** Creates a repository in a fresh temporary directory, on `main`, with one empty commit. */
export function makeGitFixture(prefix: string): string {
  const root = makeScratchDir(prefix);
  git(root, 'init', '--quiet', '--initial-branch=main');
  git(root, 'commit', '--quiet', '--allow-empty', '--message', 'Initial commit');
  return root;
}
