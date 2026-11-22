import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { isRecord } from '../../lib/type-guards.ts';
import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';
import { makeFakeToken } from '../test-utils/make-fake-token.ts';

const execFileAsync = promisify(execFile);

const CLI_PATH = fileURLToPath(new URL('../cli.ts', import.meta.url));

describe('record-external-operation CLI', () => {
  it('scans the git top level when --root is absent, and exits 1 on a finding', async () => {
    const root = makeScratchDir('record-external-operation-');
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    const nested = path.join(root, 'docs', 'operations');
    mkdirSync(nested, { recursive: true });
    writeFileSync(path.join(nested, 'vercel.md'), `${makeFakeToken('sk-', 30)}\n`);

    const result = await runCli(['scan'], nested);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ findings: [{ file: 'docs/operations/vercel.md' }], ok: false });
  });

  it('exits 0 with ok: true when --root names a directory without findings', async () => {
    const root = makeScratchDir('record-external-operation-');

    const result = await runCli(['scan', '--root', root], root);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ findings: [], ok: true });
  });

  it('exits 1 and names --root outside a git repository', async () => {
    const root = makeScratchDir('record-external-operation-');

    const result = await runCli(['scan'], root);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('pass --root');
  });

  it.each([
    [[], 'a subcommand is required'],
    [['list'], 'unknown subcommand: list'],
    [['scan', 'extra'], 'unexpected argument: extra'],
    [['scan', '--root', 'a', '--root', 'b'], '--root may be given only once'],
  ])('exits 2 on %j', async (argv, message) => {
    const result = await runCli(argv, makeScratchDir('record-external-operation-'));

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(message);
  });

  it('prints usage and exits 0 on --help', async () => {
    const result = await runCli(['--help'], makeScratchDir('record-external-operation-'));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('usage: record-external-operation scan');
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
