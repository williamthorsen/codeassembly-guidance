/* eslint n/no-process-exit: off -- CLI entry point: The process must exit non-zero when it crashes, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the GitHub Issues progress source: `list` reads a repository's issues, states each in the item
// contract of the progress report, writes the items file, and prints one JSON result.

import { writeFile } from 'node:fs/promises';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { runCommand } from '../groom-backlog/fetch.ts';
import type { CommandRunner } from '../groom-backlog/types.ts';
import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import type { ProgressItemsFile } from '../write-progress-report/schemas.ts';
import { fetchIssues } from './fetch.ts';
import { normalizeIssues } from './normalize.ts';

/** The helper's result: where it wrote the items, or a structured failure that the helper reports at exit 0. */
export type CommandResult =
  { count: number; ok: true; path: string; truncated: boolean } | { error: string; message: string; ok: false };

/** What a command reads from and writes to its environment, injected so that tests can supply fixtures. */
export interface CommandContext {
  cwd: string;
  run: CommandRunner;
  writeText: (path: string, text: string) => Promise<void>;
}

type FlagName = 'limit' | 'needs-input-label' | 'out' | 'repo' | 'scope';

const FLAG_SPECS: ReadonlyArray<FlagSpec<FlagName>> = [
  { name: 'limit', takesValue: true },
  { name: 'needs-input-label', takesValue: true },
  { name: 'out', takesValue: true },
  { name: 'repo', takesValue: true },
  { name: 'scope', takesValue: true },
];

/** The most issues that `list` reads without `--limit`. */
const DEFAULT_LIMIT = 500;

/** The label that marks an issue as an open ask of the customer without `--needs-input-label`. */
const DEFAULT_NEEDS_INPUT_LABEL = 'needs-input';

const PROGRAM = 'list-gh-progress-items';

/** A failure that a command reports as a structured result rather than throwing to `main`. */
class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Runs one command, and reports invalid arguments and a failed `gh` call as structured `{ ok: false }` results. */
export async function runCli(argv: readonly string[], context: CommandContext): Promise<CommandResult> {
  const [command, ...rest] = argv;
  try {
    if (command !== 'list') {
      throw new CommandError('invalid-args', `expected a command (list), got "${command ?? ''}"`);
    }
    const flags = parseFlags(rest);
    if (flags.out === undefined) {
      throw new CommandError('invalid-args', '--out <path> is required');
    }
    const limit = parseLimit(flags.limit);

    let issues;
    try {
      issues = await fetchIssues(context.run, context.cwd, { limit: limit + 1, repo: flags.repo, scope: flags.scope });
    } catch (error) {
      throw new CommandError('gh-failed', `cannot list issues through gh: ${describeError(error)}`);
    }
    const file: ProgressItemsFile = normalizeIssues(
      issues.slice(0, limit),
      flags['needs-input-label'] ?? DEFAULT_NEEDS_INPUT_LABEL,
    );
    await context.writeText(flags.out, `${JSON.stringify(file, null, 2)}\n`);
    return { count: file.items.length, ok: true, path: flags.out, truncated: issues.length > limit };
  } catch (error) {
    if (error instanceof CommandError) return { error: error.code, message: error.message, ok: false };
    return { error: 'command-failed', message: describeError(error), ok: false };
  }
}

/** Executes the helper from `process.argv` and writes the JSON result to stdout, exiting 1 only when it crashes. */
async function main(): Promise<void> {
  try {
    const result = await runCli(process.argv.slice(2), {
      cwd: process.cwd(),
      run: runCommand,
      writeText: (path, text) => writeFile(path, text, 'utf8'),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${PROGRAM}: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, PROGRAM)) {
  await main();
}

// region | Helpers

/** The flags of `list`, each at most once. */
type ParsedFlags = Record<FlagName, string | undefined>;

/** Scans the flags of `list`, refusing a positional argument and a repeated flag. */
function parseFlags(argv: readonly string[]): ParsedFlags {
  let scanned;
  try {
    scanned = scanFlags(argv, FLAG_SPECS);
  } catch (error) {
    throw new CommandError('invalid-args', describeError(error));
  }
  if (scanned.positionals.length > 0) {
    throw new CommandError('invalid-args', `unexpected argument: ${scanned.positionals.join(' ')}`);
  }
  const parsed: ParsedFlags = {
    limit: undefined,
    'needs-input-label': undefined,
    out: undefined,
    repo: undefined,
    scope: undefined,
  };
  for (const { name, value } of scanned.flags) {
    if (parsed[name] !== undefined) {
      throw new CommandError('invalid-args', `--${name} may be given only once`);
    }
    parsed[name] = value ?? undefined;
  }
  return parsed;
}

/** Parses `--limit` as a positive integer, defaulting to `DEFAULT_LIMIT`. */
function parseLimit(text: string | undefined): number {
  if (text === undefined) {
    return DEFAULT_LIMIT;
  }
  const limit = Number(text);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new CommandError('invalid-args', `--limit must be a positive integer, got "${text}"`);
  }
  return limit;
}

// endregion | Helpers
