/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the condense-branch helper: condenses the checked-out branch into one commit on its merge base.

import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type FlagSpec, type MatchedFlag, scanFlags } from '../lib/parse-flags.ts';
import { condenseBranch, type CondenseResult } from './condense-branch.ts';

const FLAGS = [
  { name: 'base', takesValue: true },
  { name: 'consolidation-file', takesValue: true },
  { name: 'message-file', takesValue: true },
] as const satisfies readonly FlagSpec[];

const USAGE = 'usage: condense-branch --base <revision> --message-file <path> [--consolidation-file <path>]';

/** Runs the condensation named by `process.argv`, writing the JSON result to stdout and every diagnostic to stderr. */
function main(): void {
  try {
    const result = runCommand(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`condense-branch: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, 'condense-branch')) {
  main();
}

// region | Helpers

/** Returns the value of the flag named `name`, or `undefined` when it is absent. Throws when it is repeated or empty. */
function readSingleFlag(flags: readonly MatchedFlag[], name: string): string | undefined {
  const values = flags.filter((flag) => flag.name === name).map((flag) => flag.value ?? '');
  if (values.length > 1) {
    throw new Error(`--${name} may be given only once\n${USAGE}`);
  }
  const [value] = values;
  if (value === '') {
    throw new Error(`--${name} must not be empty\n${USAGE}`);
  }
  return value;
}

/** Parses argv and runs the condensation. Throws on a positional argument, or a missing or repeated required flag. */
function runCommand(argv: readonly string[]): CondenseResult {
  const { flags, positionals } = scanFlags(argv, FLAGS);
  if (positionals.length > 0) {
    throw new Error(`unexpected argument: ${positionals.join(' ')}\n${USAGE}`);
  }

  const base = readSingleFlag(flags, 'base');
  const messageFile = readSingleFlag(flags, 'message-file');
  const consolidationFile = readSingleFlag(flags, 'consolidation-file');
  if (base === undefined) {
    throw new Error(`--base is required\n${USAGE}`);
  }
  if (messageFile === undefined) {
    throw new Error(`--message-file is required\n${USAGE}`);
  }

  return condenseBranch({ base, consolidationFile, cwd: process.cwd(), messageFile });
}

// endregion | Helpers
