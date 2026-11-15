import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { beforeEach, describe, expect, it } from 'vitest';

import { isRecord } from '../../lib/type-guards.ts';
import { type BranchFixture, git, makeBranchFixture } from '../test-utils/make-branch-fixture.ts';

const execFileAsync = promisify(execFile);

const CLI_PATH = fileURLToPath(new URL('../cli.ts', import.meta.url));

describe('condense-branch CLI', () => {
  let fixture: BranchFixture;
  let messageFile: string;

  beforeEach(() => {
    fixture = makeBranchFixture();
    messageFile = path.join(fixture.outside, 'message.md');
    writeFileSync(messageFile, 'Condense the branch\n');
  });

  it('prints the result as JSON', async () => {
    const result = await runCli(['--base', 'main', '--message-file', messageFile], fixture.repo);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      backup: 'feature-v1',
      branch: 'feature',
      condensedHead: git(fixture.repo, 'rev-parse', 'HEAD'),
      mergeBase: fixture.forkPoint,
      trailers: 0,
    });
  });

  it('exits 1 with the failure on stderr when the condensation refuses', async () => {
    const result = await runCli(['--base', 'main', '--message-file', path.join(fixture.outside, 'none')], fixture.repo);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('condense-branch: message file is missing');
  });

  it.each([
    [['--message-file', 'm.md'], '--base is required'],
    [['--base', 'main'], '--message-file is required'],
    [['--base', 'main', '--base', 'dev', '--message-file', 'm.md'], '--base may be given only once'],
    [['--base=', '--message-file', 'm.md'], '--base must not be empty'],
    [['--base', 'main', '--message-file', 'm.md', 'extra'], 'unexpected argument: extra'],
  ])('rejects %j', async (argv, message) => {
    const result = await runCli(argv, fixture.repo);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(message);
  });
});

// region | Helpers

/** Runs the CLI in `cwd` and returns its exit code and output, whether or not it fails. */
async function runCli(
  argv: readonly string[],
  cwd: string,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  try {
    const { stderr, stdout } = await execFileAsync(process.execPath, [CLI_PATH, ...argv], { cwd });
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    if (!isRecord(error)) {
      throw error;
    }
    return {
      exitCode: typeof error['code'] === 'number' ? error['code'] : -1,
      stderr: typeof error['stderr'] === 'string' ? error['stderr'] : '',
      stdout: typeof error['stdout'] === 'string' ? error['stdout'] : '',
    };
  }
}

// endregion | Helpers
