import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import { makeSmokeScratchDir } from './smoke-scratch.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Builds a repository without an `origin` and a body file, and returns an invocation that checks the body there.
 * Exercises the argument parsing, the body read, and the target derivation, which the bundle inlines, without any
 * network call: A target outside GitHub passes without a lookup.
 */
export function makeCheckPublicReferencesSmokeTest(): SmokeTestInvocation {
  const repo = makeSmokeScratchDir('check-public-references-smoke-');
  execFileSync('git', ['init', '--quiet', repo]);
  const body = path.join(repo, 'body.md');
  writeFileSync(body, 'Uses acme/lib#1.\n');

  return {
    args: ['--title', 'Smoke test', '--body-file', body],
    cwd: repo,
    assertResult: assertCheckPublicReferencesSmokeResult,
  };
}

// region | Helpers

/** Asserts that the check passed against a non-GitHub target. */
function assertCheckPublicReferencesSmokeResult(result: unknown): void {
  if (!isRecord(result) || result['verdict'] !== 'pass' || !isRecord(result['target'])) {
    throw new Error(`expected a pass, got ${JSON.stringify(result)}`);
  }
  if (result['target']['kind'] !== 'other') {
    throw new Error(`expected a non-GitHub target, got ${JSON.stringify(result['target'])}`);
  }
}

// endregion | Helpers
