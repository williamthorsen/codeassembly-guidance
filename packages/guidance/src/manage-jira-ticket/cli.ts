/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the manage-jira-ticket helper: resolves where a Jira work item goes, compares `acli`'s active site
// with a ticket's site, converts a Markdown body to ADF, creates the work item through `acli` exactly once, and closes
// a work item with an optional post.

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { readPreferences, readProjectPreferences } from '../derive-session-context/read-preferences.ts';
import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { isEnoent, isRecord } from '../lib/type-guards.ts';
import { loadWorkTypes } from '../lib/work-types.ts';
import { resolveProjectRoot } from '../shared/resolve-project-root.ts';
import { readSiteCheck, type SiteCheck } from './check-site.ts';
import { closeWorkItem, readFirstLine } from './close-work-item.ts';
import { convertMarkdownToAdf } from './convert-body.ts';
import { type AcliResult, createWorkItem } from './create-work-item.ts';
import {
  readJiraPreferences,
  resolveChildIssueType,
  resolveDoneStatus,
  resolveTarget,
  type Target,
} from './resolve-target.ts';

const execFileAsync = promisify(execFile);

const USAGE = `usage:
  manage-jira-ticket check-site --target <url-or-host>
  manage-jira-ticket close --key <key> [--post <md>]
  manage-jira-ticket resolve-target --work-type <type> [--umbrella] [--parent-level <n>]
  manage-jira-ticket convert-body --body-file <md> --out <path>
  manage-jira-ticket create --summary <text> --body-file <md> --work-type <type> [--parent <key>] [--umbrella]`;

/** Runs the subcommand named by `process.argv`, writing its JSON result to stdout and every diagnostic to stderr. */
async function main(): Promise<void> {
  try {
    const [subcommand, ...argv] = process.argv.slice(2);
    switch (subcommand) {
      case 'check-site':
        await runCheckSite(argv);
        break;
      case 'close':
        await runClose(argv);
        break;
      case 'convert-body':
        await runConvertBody(argv);
        break;
      case 'create':
        await runCreate(argv);
        break;
      case 'resolve-target':
        await runResolveTarget(argv);
        break;
      default:
        throw new Error(subcommand === undefined ? 'missing subcommand' : `unknown subcommand '${subcommand}'`);
    }
  } catch (error) {
    process.stderr.write(`manage-jira-ticket: ${describeError(error)}\n${USAGE}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, 'manage-jira-ticket')) {
  await main();
}

// region | Helpers

/** States why `check` failed and names the command that makes the target site active. */
function describeSiteMismatch(check: SiteCheck): string {
  const switchCommand = `acli jira auth switch --site ${check.targetSite}`;
  return check.activeSite === null
    ? `could not read acli's active site; the ticket is on ${check.targetSite}. Sign in, then run \`${switchCommand}\`.`
    : `acli's active site is ${check.activeSite}, but the ticket is on ${check.targetSite}. Run \`${switchCommand}\`.`;
}

/**
 * Parses `argv` against `specs` into a value map and the set of boolean flags given, rejecting positional arguments and
 * absent required flags.
 */
function parseFlags(argv: readonly string[], specs: readonly FlagSpec[], required: readonly string[]) {
  const { flags, positionals } = scanFlags(argv, specs);
  if (positionals.length > 0) {
    throw new Error(`unexpected argument: ${positionals.join(' ')}`);
  }
  const values = valueFlagMap(flags);
  for (const name of required) {
    if (values[name] === undefined || values[name] === '') {
      throw new Error(`--${name} is required`);
    }
  }
  const switches = new Set(flags.filter((flag) => flag.value === null).map((flag) => flag.name));
  return { switches, values };
}

/** Reads the Markdown body; throws when the file is absent or empty, so that a description is never silently dropped. */
async function readBody(bodyFile: string): Promise<string> {
  try {
    const stats = await stat(bodyFile);
    if (stats.isFile() && stats.size > 0) {
      return await readFile(bodyFile, 'utf8');
    }
  } catch (error) {
    if (!isEnoent(error)) {
      throw error;
    }
  }
  throw new Error(`Body file missing or empty: ${bodyFile}`);
}

/** Reads `--parent-level` as an integer, treating an absent value as no parent. Throws on any other value. */
function readParentLevel(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`--parent-level must be an integer, not '${value}'`);
  }
  return Number(value);
}

/**
 * Resolves the target for `workType` from the repository's preferences, which the caller reads from the repository's
 * file alone, so that a project key in the user's global file never sends a repository's work items to another project.
 */
async function readTarget(
  workType: string,
  preferences: Readonly<Record<string, unknown>>,
  umbrella: boolean,
): Promise<Target> {
  const workTypes = await loadWorkTypes();
  if (workTypes === null) {
    throw new Error('the work-type taxonomy could not be read');
  }
  return resolveTarget(workType, readJiraPreferences(preferences), workTypes, { umbrella });
}

/**
 * Reads `ticket.base_url` from the repository's preferences, falling back to the global file as the session manifest
 * does, and treats an absent or empty value as unset. Unlike the project key, a global base URL is safe to read here:
 * It can only make the site check refuse, never send a work item elsewhere.
 */
async function readTicketBaseUrl(projectRoot: string): Promise<string | undefined> {
  const baseUrl = (await readPreferences({ cwd: projectRoot })).preferences.ticket?.base_url;
  return baseUrl === '' ? undefined : baseUrl;
}

/**
 * Compares `acli`'s active site with `baseUrl`'s site and returns the active site, or null when `baseUrl` is unset and
 * the check does not run. On a mismatch, prints the refusal, prefixing its warning with `action`, and exits 1.
 */
async function refuseOnSiteMismatch(baseUrl: string | undefined, action: string): Promise<string | null> {
  if (baseUrl === undefined) {
    return null;
  }
  const check = await readSiteCheck(baseUrl, runAcli);
  if (check.match) {
    return check.activeSite;
  }

  const warning = `${action}: ${describeSiteMismatch(check)}`;
  writeJson({
    activeSite: check.activeSite,
    fallback: check.activeSite === null ? 'site-unreadable' : 'wrong-site',
    targetSite: check.targetSite,
    warning,
  });
  process.stderr.write(`manage-jira-ticket: ${warning}\n`);
  process.exit(1);
}

/** Runs `acli` without a shell and reports its exit code and output; throws when `acli` cannot be started. */
async function runAcli(args: readonly string[]): Promise<AcliResult> {
  try {
    const { stderr, stdout } = await execFileAsync('acli', args, { maxBuffer: 16_777_216 });
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error('acli is not installed or not on PATH', { cause: error });
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

/** Prints the site check for `--target`, exiting non-zero and naming the switch command unless the sites match. */
async function runCheckSite(argv: readonly string[]): Promise<void> {
  const { values } = parseFlags(argv, [{ name: 'target', takesValue: true }], ['target']);
  const check = await readSiteCheck(values['target'] ?? '', runAcli);
  writeJson(check);
  if (check.match) {
    return;
  }

  process.stderr.write(`manage-jira-ticket: ${describeSiteMismatch(check)}\n`);
  process.exitCode = 1;
}

/**
 * Posts `--post` on the work item unless already posted, then transitions it to the repository's done status unless its
 * status category is done. Exits non-zero, after printing the result, when the site check refuses or a call fails.
 */
async function runClose(argv: readonly string[]): Promise<void> {
  const { values } = parseFlags(
    argv,
    [
      { name: 'key', takesValue: true },
      { name: 'post', takesValue: true },
    ],
    ['key'],
  );
  const postFile = values['post'] === '' ? undefined : values['post'];
  const adf = postFile === undefined ? undefined : convertMarkdownToAdf(await readBody(postFile));
  const firstLine = adf === undefined ? '' : readFirstLine(adf);
  if (adf !== undefined && firstLine === '') {
    throw new Error(`the post's first block does not contain any text: ${postFile}`);
  }

  const projectRoot = resolveProjectRoot();
  const doneStatus = resolveDoneStatus(readJiraPreferences(await readProjectPreferences(projectRoot)));
  await refuseOnSiteMismatch(await readTicketBaseUrl(projectRoot), 'Jira work item not closed');

  const scratchDir = await mkdtemp(path.join(tmpdir(), 'manage-jira-ticket-'));
  try {
    let post: { adfPath: string; firstLine: string } | undefined;
    if (adf !== undefined) {
      const adfPath = path.join(scratchDir, 'post.json');
      await writeFile(adfPath, JSON.stringify(adf));
      post = { adfPath, firstLine };
    }
    const outcome = await closeWorkItem({ doneStatus, key: values['key'] ?? '', post }, runAcli);
    writeJson(outcome.result);
    if (!outcome.ok) {
      process.stderr.write(`manage-jira-ticket: ${outcome.result.error ?? 'close failed'}\n`);
      process.exitCode = 1;
    }
  } finally {
    await rm(scratchDir, { force: true, recursive: true });
  }
}

/** Converts the body to ADF and writes it to `--out`. */
async function runConvertBody(argv: readonly string[]): Promise<void> {
  const { values } = parseFlags(
    argv,
    [
      { name: 'body-file', takesValue: true },
      { name: 'out', takesValue: true },
    ],
    ['body-file', 'out'],
  );
  const adfPath = path.resolve(values['out'] ?? '');
  const adf = convertMarkdownToAdf(await readBody(values['body-file'] ?? ''));
  await writeFile(adfPath, `${JSON.stringify(adf)}\n`);
  writeJson({ adfPath });
}

/**
 * Resolves the target, converts the body, and creates the work item. Exits non-zero, after printing the result, when the
 * preferences do not name a project or the create did not yield a key.
 */
async function runCreate(argv: readonly string[]): Promise<void> {
  const { switches, values } = parseFlags(
    argv,
    [
      { name: 'body-file', takesValue: true },
      { name: 'parent', takesValue: true },
      { name: 'summary', takesValue: true },
      { name: 'umbrella', takesValue: false },
      { name: 'work-type', takesValue: true },
    ],
    ['body-file', 'summary', 'work-type'],
  );
  const markdown = await readBody(values['body-file'] ?? '');
  const projectRoot = resolveProjectRoot();
  const target = await readTarget(
    values['work-type'] ?? '',
    await readProjectPreferences(projectRoot),
    switches.has('umbrella'),
  );
  if ('fallback' in target) {
    writeJson(target);
    process.stderr.write(`manage-jira-ticket: ${target.warning}\n`);
    process.exit(1);
  }

  // Check the site before any other `acli` call, because `acli` acts on its active site whatever the project key names.
  const activeSite = await refuseOnSiteMismatch(await readTicketBaseUrl(projectRoot), 'Jira work item not created');

  const scratchDir = await mkdtemp(path.join(tmpdir(), 'manage-jira-ticket-'));
  try {
    const adfPath = path.join(scratchDir, 'description.json');
    await writeFile(adfPath, JSON.stringify(convertMarkdownToAdf(markdown)));
    const parent = values['parent'] === '' ? undefined : values['parent'];
    const outcome = await createWorkItem({ ...target, adfPath, parent, summary: values['summary'] ?? '' }, runAcli);
    for (const diagnostic of outcome.diagnostics) {
      process.stderr.write(`manage-jira-ticket: ${diagnostic}\n`);
    }
    writeJson({ ...outcome.result, activeSite });
    if (!outcome.ok) {
      process.exitCode = 1;
    }
  } finally {
    await rm(scratchDir, { force: true, recursive: true });
  }
}

/**
 * Resolves and prints the target for `--work-type`, as an umbrella under `--umbrella`. Under `--parent-level`, the
 * issue type is the one that the work item takes under a parent at that level, and `parentAllowed` reports whether
 * Jira accepts that parent for it.
 */
async function runResolveTarget(argv: readonly string[]): Promise<void> {
  const { switches, values } = parseFlags(
    argv,
    [
      { name: 'parent-level', takesValue: true },
      { name: 'umbrella', takesValue: false },
      { name: 'work-type', takesValue: true },
    ],
    ['work-type'],
  );
  const parentLevel = readParentLevel(values['parent-level']);
  const preferences = await readProjectPreferences(resolveProjectRoot());
  const target = await readTarget(values['work-type'] ?? '', preferences, switches.has('umbrella'));
  if ('fallback' in target) {
    writeJson(target);
    return;
  }
  if (parentLevel === undefined) {
    writeJson({ issueType: target.issueType, projectKey: target.projectKey });
    return;
  }
  writeJson({ ...resolveChildIssueType(target, parentLevel), projectKey: target.projectKey });
}

/** Writes `value` to stdout as indented JSON. */
function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

// endregion | Helpers
