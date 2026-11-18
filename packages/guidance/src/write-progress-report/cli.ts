/* eslint n/no-process-exit: off -- CLI entry point: The process must exit non-zero on failure, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the progress-report helper, which prints one JSON result per command: `assemble` reads a file of
// work items and groups, orders, and dates the rows; `render` merges the agent's text with an `assemble` result, checks
// its links, and writes the report.

import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';
import type { z } from 'zod';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { type AssembledReport, assembleReport, type ReportPeriod } from './assemble.ts';
import { RenderError, renderReport, REPORT_FORMATS, type ReportFormat } from './render.ts';
import { AssembledResultSchema, CalendarDateSchema, ProgressItemsFileSchema, ReportTextFileSchema } from './schemas.ts';

/** The helper's result: a command's output, or a structured failure that the helper reports at exit 0. */
export type CommandResult =
  | { error: string; message: string; ok: false }
  | ({ ok: true } & AssembledReport)
  | { format: ReportFormat; ok: true; text: string };

/** What a command reads from its environment, injected so that tests can supply fixtures. */
export interface CommandContext {
  readText: (path: string) => Promise<string>;
  /** Today's UTC date, `YYYY-MM-DD`, used when `--today` is absent; item dates are UTC dates too. */
  today: string;
}

type FlagName = 'assembled' | 'format' | 'internal-host' | 'items' | 'period' | 'text' | 'today';

/** The flags of each command; `internal-host` alone may repeat. */
const COMMAND_FLAGS = {
  assemble: ['items', 'period', 'today'],
  render: ['assembled', 'format', 'internal-host', 'text'],
} as const satisfies Record<string, readonly FlagName[]>;

type CommandName = keyof typeof COMMAND_FLAGS;

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

/** Runs one command and reports invalid arguments and invalid input files as structured `{ ok: false }` results. */
export async function runCli(argv: readonly string[], context: CommandContext): Promise<CommandResult> {
  const [command, ...rest] = argv;
  try {
    if (command !== 'assemble' && command !== 'render') {
      throw new CommandError('invalid-args', `expected a command (assemble, render), got "${command ?? ''}"`);
    }
    const flags = parseFlags(command, rest);
    return command === 'assemble' ? await runAssemble(flags, context) : await runRender(flags, context);
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

/** The flags of one command: each single flag at most once, and every `--internal-host` in order. */
interface ParsedFlags {
  internalHosts: string[];
  single: Partial<Record<Exclude<FlagName, 'internal-host'>, string>>;
}

/** Assembles the report from the items file. */
async function runAssemble(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const today = flags.single.today ?? context.today;
  if (!CalendarDateSchema.safeParse(today).success) {
    throw new CommandError('invalid-args', `--today must be a YYYY-MM-DD calendar date, got "${today}"`);
  }
  const period = flags.single.period === undefined ? null : parsePeriod(flags.single.period, today);
  const file = await readJsonFile(flags.single.items, '--items', ProgressItemsFileSchema, context, 'the item contract');
  return { ok: true, ...assembleReport(file.items, file.workstreams ?? [], period, today) };
}

/** Renders the report from an `assemble` result and the agent's text. */
async function runRender(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const format = flags.single.format ?? 'markdown';
  if (!isReportFormat(format)) {
    throw new CommandError('invalid-args', `--format must be one of ${REPORT_FORMATS.join(', ')}, got "${format}"`);
  }
  const assembled = await readJsonFile(
    flags.single.assembled,
    '--assembled',
    AssembledResultSchema,
    context,
    'the shape of an assemble result',
  );
  const text = await readJsonFile(flags.single.text, '--text', ReportTextFileSchema, context, 'the report text shape');
  try {
    return { format, ok: true, text: renderReport(assembled, text, format, flags.internalHosts) };
  } catch (error) {
    if (error instanceof RenderError) throw new CommandError('invalid-text', error.message);
    throw error;
  }
}

/** Scans the flags of `command`, refusing a positional argument, another command's flag, and a repeated single flag. */
function parseFlags(command: CommandName, argv: readonly string[]): ParsedFlags {
  const specs: FlagSpec<FlagName>[] = COMMAND_FLAGS[command].map((name) => ({ name, takesValue: true }));
  let scanned;
  try {
    scanned = scanFlags(argv, specs);
  } catch (error) {
    throw new CommandError('invalid-args', describeError(error));
  }
  if (scanned.positionals.length > 0) {
    throw new CommandError('invalid-args', `unexpected argument: ${scanned.positionals.join(' ')}`);
  }
  const parsed: ParsedFlags = { internalHosts: [], single: {} };
  for (const { name, value } of scanned.flags) {
    const text = value ?? '';
    if (name === 'internal-host') {
      parsed.internalHosts.push(text);
      continue;
    }
    if (parsed.single[name] !== undefined) {
      throw new CommandError('invalid-args', `--${name} may be given only once`);
    }
    parsed.single[name] = text;
  }
  return parsed;
}

/** Returns whether `value` is a `YYYY-MM-DD` calendar date. */
function isDate(value: string | undefined): value is string {
  return value !== undefined && CalendarDateSchema.safeParse(value).success;
}

/** Returns whether `value` names a format that `render` writes. */
function isReportFormat(value: string): value is ReportFormat {
  return REPORT_FORMATS.some((known) => known === value);
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

/** Reads and validates a JSON input file, naming the place of each violation of `shape`. */
async function readJsonFile<Schema extends z.ZodType>(
  path: string | undefined,
  flag: string,
  schema: Schema,
  context: CommandContext,
  shape: string,
): Promise<z.infer<Schema>> {
  if (path === undefined) {
    throw new CommandError('invalid-args', `${flag} <path> is required`);
  }
  const code = flag === '--items' ? 'invalid-items' : 'invalid-input';
  let parsed: unknown;
  try {
    parsed = JSON.parse(await context.readText(path));
  } catch (error) {
    throw new CommandError(code, `cannot read ${path} as JSON: ${describeError(error)}`);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const where = issue.path.length === 0 ? 'the file' : issue.path.map(String).join('.');
      return `${where}: ${issue.message}`;
    });
    throw new CommandError(code, `${path} violates ${shape}: ${issues.join('; ')}`);
  }
  return result.data;
}

// endregion | Helpers
