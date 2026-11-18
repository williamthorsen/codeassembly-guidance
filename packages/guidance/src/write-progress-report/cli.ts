/* eslint n/no-process-exit: off -- CLI entry point: The process must exit non-zero on failure, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the progress-report helper: `assemble` reads a file of work items, assigns each its status,
// applies the reporting period, sorts the rows, and prints one JSON result.

import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { type AssembledReport, assembleReport, type ReportPeriod } from './assemble.ts';
import { CalendarDateSchema, type ProgressItem, ProgressItemsFileSchema } from './schemas.ts';

/** The helper's result: the assembled report, or a structured failure that the helper reports at exit 0. */
export type CommandResult = { error: string; message: string; ok: false } | ({ ok: true } & AssembledReport);

/** What a command reads from its environment, injected so that tests can supply fixtures. */
export interface CommandContext {
  readText: (path: string) => Promise<string>;
  /** Today's UTC date, `YYYY-MM-DD`, used when `--today` is absent; item dates are UTC dates too. */
  today: string;
}

type FlagName = 'items' | 'period' | 'today';

const FLAG_SPECS: ReadonlyArray<FlagSpec<FlagName>> = [
  { name: 'items', takesValue: true },
  { name: 'period', takesValue: true },
  { name: 'today', takesValue: true },
];

const PROGRAM = 'write-progress-report';

/** A failure that a command reports as a structured result rather than throwing to `main`. */
class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Runs one command and reports invalid arguments and an invalid items file as structured `{ ok: false }` results. */
export async function runCli(argv: readonly string[], context: CommandContext): Promise<CommandResult> {
  const [command, ...rest] = argv;
  try {
    if (command !== 'assemble') {
      throw new CommandError('invalid-args', `expected a command (assemble), got "${command ?? ''}"`);
    }
    const flags = parseFlags(rest);
    const today = flags.today ?? context.today;
    const period = flags.period === undefined ? null : parsePeriod(flags.period, today);
    const items = await readItems(flags.items, context);
    return { ok: true, ...assembleReport(items, period) };
  } catch (error) {
    if (error instanceof CommandError) return { error: error.code, message: error.message, ok: false };
    return { error: 'command-failed', message: describeError(error), ok: false };
  }
}

/** Executes the helper from `process.argv` and writes the JSON result to stdout, exiting 1 only when it crashes. */
async function main(): Promise<void> {
  try {
    const result = await runCli(process.argv.slice(2), {
      readText: (path) => readFile(path, 'utf8'),
      today: new Date().toISOString().slice(0, 10),
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

/** The flags of `assemble`, each at most once. */
interface ParsedFlags {
  items: string | undefined;
  period: string | undefined;
  today: string | undefined;
}

/** Scans the flags of `assemble`, refusing a positional argument and a repeated flag. */
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
  const parsed: ParsedFlags = { items: undefined, period: undefined, today: undefined };
  for (const { name, value } of scanned.flags) {
    if (parsed[name] !== undefined) {
      throw new CommandError('invalid-args', `--${name} may be given only once`);
    }
    parsed[name] = value ?? undefined;
  }
  if (parsed.today !== undefined && !CalendarDateSchema.safeParse(parsed.today).success) {
    throw new CommandError('invalid-args', `--today must be a YYYY-MM-DD calendar date, got "${parsed.today}"`);
  }
  return parsed;
}

/** Returns whether `value` is a `YYYY-MM-DD` calendar date. */
function isDate(value: string | undefined): value is string {
  return value !== undefined && CalendarDateSchema.safeParse(value).success;
}

/** Parses `<start>[..<end>]` into an inclusive period whose end defaults to `today`. */
function parsePeriod(text: string, today: string): ReportPeriod {
  const [start, end = today, ...extra] = text.split('..');
  if (extra.length > 0 || !isDate(start) || !isDate(end)) {
    throw new CommandError('invalid-args', `--period must be <start>[..<end>] with YYYY-MM-DD dates, got "${text}"`);
  }
  if (start > end) {
    throw new CommandError('invalid-args', `--period starts after it ends: "${text}"`);
  }
  return { end, start };
}

/** Reads and validates the items file, naming the item and the field of the first violations. */
async function readItems(path: string | undefined, context: CommandContext): Promise<ProgressItem[]> {
  if (path === undefined) {
    throw new CommandError('invalid-args', '--items <path> is required');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await context.readText(path));
  } catch (error) {
    throw new CommandError('invalid-items', `cannot read ${path} as JSON: ${describeError(error)}`);
  }
  const result = ProgressItemsFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const where = issue.path.length === 0 ? 'the file' : issue.path.map(String).join('.');
      return `${where}: ${issue.message}`;
    });
    throw new CommandError('invalid-items', `${path} violates the item contract: ${issues.join('; ')}`);
  }
  return result.data.items;
}

// endregion | Helpers
