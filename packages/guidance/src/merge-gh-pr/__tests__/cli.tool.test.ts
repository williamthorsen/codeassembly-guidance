import { execFile } from 'node:child_process';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { beforeEach, describe, expect, it } from 'vitest';

import { isEnoent, isRecord } from '../../lib/type-guards.ts';
import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';

const execFileAsync = promisify(execFile);

const CLI_PATH = fileURLToPath(new URL('../cli.ts', import.meta.url));

const MERGED_VIEW = JSON.stringify({
  state: 'MERGED',
  mergeCommit: { oid: 'abc123' },
  url: 'https://github.com/acme/widgets/pull/42',
  mergedAt: '2026-09-28T22:00:00Z',
  baseRefName: 'main',
  headRefName: 'feature/cache',
  headRepository: { name: 'widgets' },
  headRepositoryOwner: { login: 'acme' },
});

// A `gh` stand-in: It appends its argv to the log as one JSON line and takes its output and exit code from the
// STUB_* variables. `API` is the branch deletion and `COMMIT` the read of the merge commit's subject.
const GH_STUB = String.raw`#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify(args) + '\n');
const kind = args[0] === 'api' ? (args[1] === '-X' ? 'API' : 'COMMIT') : args[1] === 'merge' ? 'MERGE' : 'VIEW';
const stdout = { COMMIT: 'agents|feat: Quote safely (#42)\n', VIEW: process.env.STUB_VIEW };
process.stdout.write(stdout[kind] ?? '');
process.stderr.write(process.env['STUB_' + kind + '_STDERR'] ?? '');
process.exit(Number(process.env['STUB_' + kind + '_EXIT'] ?? '0'));
`;

describe('merge-gh-pr CLI', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = makeScratchDir('merge-gh-pr-');
    const ghPath = path.join(workDir, 'gh');
    await writeFile(ghPath, GH_STUB);
    await chmod(ghPath, 0o755);
  });

  it('passes a title containing shell syntax to gh byte-for-byte and prints the result', async () => {
    const title = 'agents|feat: Quote `rm -rf` and $(whoami) safely';
    const titleFile = await writeInput(workDir, 'title.txt', `${title}\n`);
    const bodyFile = await writeInput(workDir, 'body.md', 'Body with `code` and $(date).\n');

    const result = await runCli(workDir, squashArgs(titleFile, bodyFile));

    expect(result.exitCode).toBe(0);
    const calls = await readCalls(workDir);
    expect(calls[0]).toEqual(['pr', 'merge', '42', '--squash', '--subject', title, '--body-file', bodyFile]);
    expect(calls[2]).toEqual(['api', '-X', 'DELETE', 'repos/acme/widgets/git/refs/heads/feature/cache']);
    expect(calls[3]).toEqual(['api', 'repos/{owner}/{repo}/commits/abc123', '--jq', '.commit.message']);
    expect(JSON.parse(result.stdout)).toEqual({
      branchDeletion: 'deleted',
      headRefName: 'feature/cache',
      mergeCommit: { oid: 'abc123' },
      mergedAt: '2026-09-28T22:00:00Z',
      summary:
        '---\n\n## 🔀 Merged into main · squash · abc123\n\n' +
        'Commit title: agents|feat: Quote safely (#42)\n' +
        'PR: https://github.com/acme/widgets/pull/42\n' +
        'Remote branch feature/cache: 🗑️ Deleted',
      url: 'https://github.com/acme/widgets/pull/42',
    });
  });

  it('refuses an empty body file for a squash without calling gh', async () => {
    const titleFile = await writeInput(workDir, 'title.txt', 'Title\n');
    const bodyFile = await writeInput(workDir, 'body.md', '');

    const result = await runCli(workDir, squashArgs(titleFile, bodyFile));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`Body file missing or empty: ${bodyFile}`);
    expect(await readCalls(workDir)).toEqual([]);
  });

  it('refuses a squash whose title file is missing', async () => {
    const bodyFile = await writeInput(workDir, 'body.md', 'Body\n');

    const result = await runCli(workDir, squashArgs(path.join(workDir, 'absent.txt'), bodyFile));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Title file missing or empty');
    expect(await readCalls(workDir)).toEqual([]);
  });

  it('accepts a rebase without a title or body file', async () => {
    const result = await runCli(workDir, ['--pr', '42', '--strategy', 'rebase', '--delete', 'none']);

    expect(result.exitCode).toBe(0);
    expect((await readCalls(workDir))[0]).toEqual(['pr', 'merge', '42', '--rebase']);
  });

  it("exits with gh's code and passes on its stderr when the merge fails", async () => {
    const titleFile = await writeInput(workDir, 'title.txt', 'Title\n');
    const bodyFile = await writeInput(workDir, 'body.md', 'Body\n');

    const result = await runCli(workDir, squashArgs(titleFile, bodyFile), {
      STUB_MERGE_EXIT: '4',
      STUB_MERGE_STDERR: 'GraphQL: Pull request is not mergeable\n',
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).toBe('GraphQL: Pull request is not mergeable\n');
    expect(JSON.parse(result.stdout)).toEqual({
      summary: '---\n\n## ❌ Not merged\n\nPR: #42\nReason: GraphQL: Pull request is not mergeable',
    });
  });

  it('warns on a failed deletion and still exits 0 with the result', async () => {
    const titleFile = await writeInput(workDir, 'title.txt', 'Title\n');
    const bodyFile = await writeInput(workDir, 'body.md', 'Body\n');

    const result = await runCli(workDir, squashArgs(titleFile, bodyFile), {
      STUB_API_EXIT: '1',
      STUB_API_STDERR: 'gh: Server Error (HTTP 500)\n',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("warning: Failed to delete remote branch 'feature/cache': gh: Server Error");
    expect(JSON.parse(result.stdout)).toMatchObject({ branchDeletion: 'failed' });
  });

  it('rejects a strategy outside its set', async () => {
    const result = await runCli(workDir, ['--pr', '42', '--strategy', 'fast-forward', '--delete', 'none']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--strategy must be one of merge, rebase, squash');
    expect(JSON.parse(result.stdout)).toMatchObject({
      summary: expect.stringContaining('## ❌ Not merged\n\nPR: #42\n'),
    });
  });
});

// region | Helpers

interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/** Returns true for the rejection that `execFile` produces when the child exits non-zero. */
function isExecError(error: unknown): error is CliResult & { code: number } {
  return (
    isRecord(error) &&
    typeof error['code'] === 'number' &&
    typeof error['stderr'] === 'string' &&
    typeof error['stdout'] === 'string'
  );
}

/** Reads the argument arrays that the `gh` stand-in recorded, in call order. */
async function readCalls(workDir: string): Promise<unknown[]> {
  let log: string;
  try {
    log = await readFile(path.join(workDir, 'calls.log'), 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }
  return log
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line): unknown => JSON.parse(line));
}

/** Runs the helper's source under the running Node with the `gh` stand-in first on `PATH`. */
async function runCli(
  workDir: string,
  argv: readonly string[],
  stubEnv: Record<string, string> = {},
): Promise<CliResult> {
  const env = {
    ...process.env,
    PATH: `${workDir}${path.delimiter}${process.env['PATH'] ?? ''}`,
    STUB_LOG: path.join(workDir, 'calls.log'),
    STUB_VIEW: MERGED_VIEW,
    ...stubEnv,
  };
  try {
    const { stderr, stdout } = await execFileAsync(process.execPath, [CLI_PATH, ...argv], { env });
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    if (isExecError(error)) {
      return { exitCode: error.code, stderr: error.stderr, stdout: error.stdout };
    }
    throw error;
  }
}

/** Returns the argv for a squash of PR 42 with remote deletion. */
function squashArgs(titleFile: string, bodyFile: string): string[] {
  return [
    '--pr',
    '42',
    '--strategy',
    'squash',
    '--delete',
    'remote',
    '--title-file',
    titleFile,
    '--body-file',
    bodyFile,
  ];
}

/** Writes an input file into the working directory and returns its absolute path. */
async function writeInput(workDir: string, name: string, content: string): Promise<string> {
  const filePath = path.join(workDir, name);
  await writeFile(filePath, content);
  return filePath;
}

// endregion | Helpers
