import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import { makeSmokeScratchDir } from './smoke-scratch.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Builds a root whose operations directory contains one clean document, and returns an invocation that scans it.
 * Exercises the directory walk and the matcher, which the bundle inlines.
 */
export function makeRecordExternalOperationSmokeTest(): SmokeTestInvocation {
  const root = makeSmokeScratchDir('record-external-operation-smoke-');
  const directory = path.join(root, 'docs', 'operations');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'vercel.md'), '# Vercel\n\n- **Credentials:** `API_TOKEN` in the project\n');

  return {
    args: ['scan', '--root', root],
    assertResult: assertRecordExternalOperationSmokeResult,
  };
}

// region | Helpers

/** Asserts that the clean document produced no findings. */
function assertRecordExternalOperationSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from record-external-operation');
  }
  if (result['ok'] !== true || !Array.isArray(result['findings']) || result['findings'].length > 0) {
    throw new Error(`expected ok: true with no findings, got ${JSON.stringify(result)}`);
  }
}

// endregion | Helpers
