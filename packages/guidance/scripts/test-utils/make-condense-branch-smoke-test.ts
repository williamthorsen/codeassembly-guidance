import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import { makeSmokeScratchDir } from './smoke-scratch.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Builds a repository whose checked-out `feature` branch has two commits beyond `main`, and returns an invocation that
 * condenses it. Exercises `commit-tree` and `update-ref`, which the bundle runs through real git.
 */
export function makeCondenseBranchSmokeTest(): SmokeTestInvocation {
  const root = makeSmokeScratchDir('condense-branch-smoke-');
  const repo = path.join(root, 'repo');
  const messageFile = path.join(root, 'message.md');

  runGit(root, 'init', '--quiet', '--initial-branch=main', repo);
  runGit(repo, 'config', 'user.email', 'test@example.com');
  runGit(repo, 'config', 'user.name', 'Test');
  runGit(repo, 'commit', '--quiet', '--allow-empty', '--message', 'Initial commit');
  runGit(repo, 'switch', '--quiet', '--create', 'feature');
  runGit(repo, 'commit', '--quiet', '--allow-empty', '--message', 'One');
  runGit(repo, 'commit', '--quiet', '--allow-empty', '--message', 'Two');
  writeFileSync(messageFile, 'Condense the branch\n');

  return {
    args: ['--base', 'main', '--message-file', messageFile],
    cwd: repo,
    assertResult: assertCondenseBranchSmokeResult,
  };
}

// region | Helpers

/** Asserts that the branch was condensed and backed up, which a failed `commit-tree` or `update-ref` would prevent. */
function assertCondenseBranchSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from condense-branch');
  }
  if (result['branch'] !== 'feature' || result['backup'] !== 'feature-v1' || result['trailers'] !== 0) {
    throw new Error(`expected branch: feature, backup: feature-v1, trailers: 0, got ${JSON.stringify(result)}`);
  }
}

/** Runs git in `cwd` with automatic maintenance disabled. */
function runGit(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', ...args], { cwd, stdio: 'ignore' });
}

// endregion | Helpers
