/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the check-public-references helper: refuses text for a public repository that references a
// repository not verified public.

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { promisify } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { isMissingFile } from '../lib/type-guards.ts';
import { type GhRunner, runGh } from '../shared/gh.ts';
import { checkPublicReferences, type CheckResult, type Target } from './check-public-references.ts';

const PROGRAM = 'check-public-references';

const FLAGS = [
  { name: 'body-file', takesValue: true },
  { name: 'help', aliases: ['h'], takesValue: false },
  { name: 'repo', takesValue: true },
  { name: 'title', takesValue: true },
] as const satisfies readonly FlagSpec[];

// An HTTPS, `ssh://`, or scp-style remote on github.com, with an optional `.git` suffix.
const GITHUB_REMOTE_PATTERN =
  /^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/[^@/]+@|[^@/:]+@)github\.com[:/]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i;

const REPO_PATTERN = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

const USAGE = `usage: check-public-references [--repo <owner>/<name>] [--title <text>] [--body-file <path>]...

Refuses a title or body for a public GitHub repository when it references a repository that GitHub does not report as
public: a private, internal, or unknown one. A GitHub URL or an <owner>/<name>#<number> reference counts for any owner;
a bare <owner>/<name> counts when the owner is the target's owner or the authenticated gh user. A private target, or
one outside GitHub, passes without a lookup. <repo> defaults to the origin remote of the working directory.

Prints the result as JSON on stdout and one line per refused reference on stderr. Requires gh.

Exit codes: 0 on a pass, 1 on a refusal or when the target's visibility cannot be read, 2 on a usage error, a missing
or empty body file included.

Example: check-public-references --title "Fix the parser" --body-file /tmp/body.md && gh pr create ...`;

const execFileAsync = promisify(execFile);

/** The effects that `runCommand` reaches through, so that tests can replace them. */
export interface CommandDeps {
  gh: GhRunner;
  /** Returns the URL of the working directory's `origin` remote, or `undefined` when it has none. */
  readOriginUrl: () => Promise<string | undefined>;
}

/** What the entry point writes and the exit code that it sets. */
export interface CommandOutput {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/**
 * Parses argv, checks the title and body files against the target, and returns the output: the result as JSON on
 * stdout, a line per refused reference on stderr, and exit 0 on a pass, 1 on a refusal or a failed lookup of the
 * target, and 2 on a usage error, a missing or empty body file included.
 */
export async function runCommand(argv: readonly string[], deps: CommandDeps): Promise<CommandOutput> {
  let command: Command;
  try {
    command = await parseCommand(argv);
  } catch (error) {
    return { exitCode: 2, stderr: `${PROGRAM}: ${describeError(error)}\n${USAGE}\n`, stdout: '' };
  }
  if (command.kind === 'help') {
    return { exitCode: 0, stderr: '', stdout: `${USAGE}\n` };
  }

  let result: CheckResult;
  try {
    const target = command.target ?? resolveOriginTarget(await deps.readOriginUrl());
    result = await checkPublicReferences(target, command.text, deps.gh);
  } catch (error) {
    return { exitCode: 1, stderr: `${PROGRAM}: ${describeError(error)}\n`, stdout: '' };
  }

  const stderr = result.references
    .filter(({ repo }) => result.refused.includes(repo))
    .map(
      ({ repo, visibility }) =>
        `${PROGRAM}: ${repo} is ${visibility}, and ${result.target.repo ?? 'the target'} is public; ` +
        'describe it without naming the repository, its tickets, or its project\n',
    )
    .join('');
  return { exitCode: result.verdict === 'pass' ? 0 : 1, stderr, stdout: `${JSON.stringify(result, null, 2)}\n` };
}

/** Runs the command named by `process.argv` and writes its output. */
async function main(): Promise<void> {
  const output = await runCommand(process.argv.slice(2), { gh: runGh, readOriginUrl });
  process.stdout.write(output.stdout);
  process.stderr.write(output.stderr);
  process.exit(output.exitCode);
}

if (isEntryPoint(import.meta.url, PROGRAM)) {
  await main();
}

// region | Helpers

/** A parsed invocation: a request for help, or a check of `text` against an explicit or derived target. */
type Command = { kind: 'help' } | { kind: 'check'; target: Target | undefined; text: string };

/**
 * Parses argv and reads the body files. Throws on a bad flag, a malformed `--repo`, or a missing or empty body file.
 */
async function parseCommand(argv: readonly string[]): Promise<Command> {
  const { flags, positionals } = scanFlags(argv, FLAGS);
  if (flags.some((flag) => flag.name === 'help')) {
    return { kind: 'help' };
  }
  if (positionals.length > 0) {
    throw new Error(`unexpected argument: ${positionals.join(' ')}`);
  }

  const repos = readValues(flags, 'repo');
  const titles = readValues(flags, 'title');
  if (repos.length > 1 || titles.length > 1) {
    throw new Error('--repo and --title may each be given once');
  }
  const [repo] = repos;
  if (repo !== undefined && !REPO_PATTERN.test(repo)) {
    throw new Error(`--repo takes <owner>/<name>, not ${repo}`);
  }
  const bodyFiles = readValues(flags, 'body-file');
  if (titles.length === 0 && bodyFiles.length === 0) {
    throw new Error('give --title, --body-file, or both');
  }

  const bodies = await Promise.all(bodyFiles.map((path) => readBody(path)));
  return {
    kind: 'check',
    target: repo === undefined ? undefined : { kind: 'github', repo },
    text: [...titles, ...bodies].join('\n'),
  };
}

/** Reads a body file. Throws when it is missing or empty, because `gh` would then publish a default or empty body. */
async function readBody(path: string): Promise<string> {
  let body: string;
  try {
    body = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      throw new Error(`--body-file ${path}: file not found; write the body to it, then run again`, { cause: error });
    }
    throw error;
  }
  if (body.trim().length === 0) {
    throw new Error(`--body-file ${path}: file is empty; write the body to it, then run again`);
  }
  return body;
}

/** Returns the URL of the working directory's `origin` remote, or `undefined` outside a repository or without one. */
async function readOriginUrl(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin']);
    return stdout.trim();
  } catch {
    return undefined;
  }
}

/** Returns the values of every occurrence of the value-bearing flag `name`. */
function readValues(flags: readonly { name: string; value: string | null }[], name: string): string[] {
  return flags.filter((flag) => flag.name === name).map((flag) => flag.value ?? '');
}

/**
 * Resolves the target from an `origin` URL: a GitHub repository when the remote is on github.com, otherwise `other`.
 */
function resolveOriginTarget(url: string | undefined): Target {
  const match = url === undefined ? null : GITHUB_REMOTE_PATTERN.exec(url);
  const [, owner, name] = match ?? [];
  return owner === undefined || name === undefined ? { kind: 'other' } : { kind: 'github', repo: `${owner}/${name}` };
}

// endregion | Helpers
