import { execFileSync } from 'node:child_process';
import path from 'node:path';

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

/** A bare remote with two clones: `upstream` advances the remote's `main`, and `work` is checked out on `feature`. */
export interface RemoteFixture {
  remote: string;
  root: string;
  upstream: string;
  work: string;
}

/**
 * Runs git in `cwd` with a fixed identity and automatic maintenance disabled, whose background run can outlive the
 * fixture's directory, and returns its trimmed stdout.
 */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', [...FIXED_CONFIG, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Creates a bare remote whose `main` has one commit, and two clones of it, in a fresh temporary directory. */
export function makeRemoteFixture(): RemoteFixture {
  const root = makeScratchDir('check-branch-currency-');
  const remote = path.join(root, 'remote.git');
  const upstream = path.join(root, 'upstream');
  const work = path.join(root, 'work');

  git(root, 'init', '--quiet', '--bare', '--initial-branch=main', remote);
  git(root, 'clone', '--quiet', remote, upstream);
  git(upstream, 'checkout', '--quiet', '-B', 'main');
  git(upstream, 'commit', '--quiet', '--allow-empty', '--message', 'Initial commit');
  git(upstream, 'push', '--quiet', 'origin', 'main');
  git(root, 'clone', '--quiet', remote, work);
  git(work, 'checkout', '--quiet', '-b', 'feature');

  return {
    remote,
    root,
    upstream,
    work,
  };
}
