import { chmodSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from './is-record.ts';
import { makeSmokeScratchDir } from './smoke-scratch.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

const SMOKE_SUBJECT = 'smoke|feat: Rebase the branch';

/**
 * Puts a `gh` stand-in first on `PATH`, then returns an invocation that rebases PR 42 and deletes its branch through
 * it. The stand-in reports the PR as merged, the merge commit's subject, and every call as successful, so the run
 * exercises the merge, the state check, the deletion, and the subject read without contacting GitHub.
 */
export function makeMergeGhPrSmokeTest(): SmokeTestInvocation {
  const binDir = makeSmokeScratchDir('merge-gh-pr-bin-');
  const view = JSON.stringify({
    state: 'MERGED',
    mergeCommit: { oid: 'abc123' },
    url: 'https://github.com/acme/widgets/pull/42',
    mergedAt: '2026-09-28T22:00:00Z',
    baseRefName: 'main',
    headRefName: 'smoke/branch',
    headRepository: { name: 'widgets' },
    headRepositoryOwner: { login: 'acme' },
  });
  const ghPath = path.join(binDir, 'gh');
  writeFileSync(
    ghPath,
    `#!${process.execPath}\n` +
      `if (process.argv[3] === 'view') process.stdout.write(${JSON.stringify(view)});\n` +
      `if (process.argv[2] === 'api' && process.argv[3] !== '-X') process.stdout.write(${JSON.stringify(SMOKE_SUBJECT)});\n`,
  );
  chmodSync(ghPath, 0o755);

  return {
    args: ['--pr', '42', '--strategy', 'rebase', '--delete', 'remote'],
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env['PATH'] ?? ''}` },
    assertResult: assertBranchDeleted,
  };
}

// region | Helpers

/** Asserts that the parsed result reports the merge commit, a deleted branch, and the merge's summary. */
function assertBranchDeleted(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result');
  }
  if (result['branchDeletion'] !== 'deleted') {
    throw new Error(`expected branchDeletion: deleted, got ${JSON.stringify(result['branchDeletion'])}`);
  }
  if (!isRecord(result['mergeCommit']) || result['mergeCommit']['oid'] !== 'abc123') {
    throw new Error(`expected mergeCommit.oid abc123, got ${JSON.stringify(result['mergeCommit'])}`);
  }
  const summary = result['summary'];
  const expectedLines = ['## 🔀 Merged into main · rebase · abc123', `Last commit title: ${SMOKE_SUBJECT}`];
  if (typeof summary !== 'string' || expectedLines.some((line) => !summary.includes(line))) {
    throw new Error(`expected a summary headed by the merge, got ${JSON.stringify(summary)}`);
  }
}

// endregion | Helpers
