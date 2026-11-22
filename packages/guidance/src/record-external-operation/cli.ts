/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the record-external-operation helper: scans a repository's operations documents for secrets.

import { execFileSync } from 'node:child_process';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { scanOperationsDocs } from './scan.ts';

const FLAGS = [
  { name: 'help', takesValue: false },
  { name: 'root', takesValue: true },
] as const satisfies readonly FlagSpec[];

const USAGE = `usage: record-external-operation scan [--root <dir>]

Scans every Markdown file under <root>/docs/operations/ for secret-shaped values and prints the findings as JSON.
<root> defaults to the git top level of the working directory.

Exit codes: 0 when there are no findings, 1 when there are findings or the scan fails, 2 on a usage error.`;

/** Runs the command named by `process.argv`, writing JSON to stdout and every diagnostic to stderr. */
function main(): void {
  let command: Command;
  try {
    command = parseCommand(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`record-external-operation: ${describeError(error)}\n${USAGE}\n`);
    process.exit(2);
  }

  if (command.kind === 'help') {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  try {
    const result = scanOperationsDocs(command.root ?? resolveGitRoot());
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`record-external-operation: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, 'record-external-operation')) {
  main();
}

// region | Helpers

/** A parsed invocation: a request for help, or a scan with an optional explicit root. */
type Command = { kind: 'help' } | { kind: 'scan'; root: string | undefined };

/** Parses argv into a command. Throws on a missing or unknown subcommand, an extra argument, or a repeated `--root`. */
function parseCommand(argv: readonly string[]): Command {
  const { flags, positionals } = scanFlags(argv, FLAGS);
  if (flags.some((flag) => flag.name === 'help')) {
    return { kind: 'help' };
  }

  const [subcommand, ...extra] = positionals;
  if (subcommand === undefined) {
    throw new Error('a subcommand is required');
  }
  if (subcommand !== 'scan') {
    throw new Error(`unknown subcommand: ${subcommand}`);
  }
  if (extra.length > 0) {
    throw new Error(`unexpected argument: ${extra.join(' ')}`);
  }

  const roots = flags.filter((flag) => flag.name === 'root').map((flag) => flag.value ?? '');
  if (roots.length > 1) {
    throw new Error('--root may be given only once');
  }
  return { kind: 'scan', root: roots[0] };
}

/** Returns the git top level of the working directory. Throws outside a git repository. */
function resolveGitRoot(): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error('the working directory is not in a git repository; pass --root <dir>');
  }
}

// endregion | Helpers
