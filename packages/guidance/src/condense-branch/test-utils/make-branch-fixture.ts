import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
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

/** A repository whose `main` has one commit and whose checked-out `feature` branch adds two more. */
export interface BranchFixture {
  /** The commit at which `feature` leaves `main`. */
  forkPoint: string;
  /** A directory outside the repository, for the message and consolidation files. */
  outside: string;
  repo: string;
}

/** Writes `content` to `name` in `repo` and commits it with `subject`. */
export function commitFile(repo: string, name: string, content: string, subject: string): void {
  writeFileSync(path.join(repo, name), content);
  git(repo, 'add', name);
  git(repo, 'commit', '--quiet', '--message', subject);
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

/** Creates the fixture repository in a fresh temporary directory, with `feature` checked out and a clean tree. */
export function makeBranchFixture(): BranchFixture {
  const root = makeScratchDir('condense-branch-');
  const repo = path.join(root, 'repo');
  const outside = path.join(root, 'outside');
  mkdirSync(outside);
  git(root, 'init', '--quiet', '--initial-branch', 'main', repo);
  // Set the identity in the repository, because the helper runs git without the fixed `-c` overrides.
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');

  commitFile(repo, 'base.txt', 'base\n', 'Base');
  const forkPoint = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'switch', '--quiet', '--create', 'feature');
  commitFile(repo, 'one.txt', 'one\n', 'Add one');
  commitFile(repo, 'two.txt', 'two\n', 'Add two');

  return { forkPoint, outside, repo };
}
