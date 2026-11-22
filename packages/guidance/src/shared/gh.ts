/** The `gh` adapter for helpers that read a command's exit code and output rather than failing on a non-zero exit. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { isEnoent, isRecord } from '../lib/type-guards.ts';

/** What one `gh` run reports. */
export interface GhResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/** Runs `gh` with the given arguments and reports its exit code and output. */
export type GhRunner = (args: readonly string[]) => Promise<GhResult>;

/** Runs `gh` without a shell and reports its exit code and output; throws when `gh` cannot be started. */
export async function runGh(args: readonly string[]): Promise<GhResult> {
  try {
    const { stderr, stdout } = await execFileAsync('gh', args, { maxBuffer: 16_777_216 });
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error('gh is not installed or not on PATH', { cause: error });
    }
    if (
      isRecord(error) &&
      typeof error['code'] === 'number' &&
      typeof error['stderr'] === 'string' &&
      typeof error['stdout'] === 'string'
    ) {
      return { exitCode: error['code'], stderr: error['stderr'], stdout: error['stdout'] };
    }
    throw error;
  }
}

// region | Helpers

const execFileAsync = promisify(execFile);

// endregion | Helpers
