/** The `sense` command: runs every sensor for one unit and gathers the results into one sense document. */
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import {
  buildExcludePathspecs,
  buildLogArgs,
  computeCoChange,
  computeHotspots,
  type HotspotRow,
  parseNumstatLog,
} from './git-history.ts';
import { buildSensorResult, type SenseDocument, type SensorResult } from './schemas.ts';
import { runStructuralSensors, STRUCTURAL_SENSOR_NAMES } from './structural-sensors.ts';
import { parseCoverageSummary, parseJunit } from './test-reports.ts';

/** A repository check that `sense` runs through the shell, such as a linter or a typecheck. */
export interface CheckSpec {
  name: string;
  command: string;
}

/** What `sense` measures, and where it writes. */
export interface SenseOptions {
  root: string;
  unit: string;
  windowDays: number;
  /** The sense document's path; each check's log is written beside it. */
  out: string;
  checks: readonly CheckSpec[];
  excludeGlobs: readonly string[];
  coverageSummary: string | undefined;
  junit: string | undefined;
}

/** The outcome of one check command: its exit code, or the reason that it could not be spawned. */
export type CheckOutcome = { exitCode: number } | { spawnError: string };

/** The outcome of one tool run: its exit code and captured output, or the reason that it could not be spawned. */
export type ToolOutcome = { exitCode: number; stdout: string; stderr: string } | { spawnError: string };

/** The processes that `sense` starts, injected so that tests can supply fixtures. */
export interface SenseDependencies {
  git(args: readonly string[], cwd: string): string;
  runCheck(command: string, cwd: string, logPath: string): CheckOutcome;
  runTool(command: string, args: readonly string[], cwd: string): ToolOutcome;
}

/** Sensor names that a check may not take, because the built-in sensors use them. */
export const RESERVED_SENSOR_NAMES: readonly string[] = [
  'co-change',
  'coverage',
  'hotspots',
  'timings',
  ...STRUCTURAL_SENSOR_NAMES,
];

/** The adapter that runs git, the check commands, and the third-party tools. */
export const realSenseDependencies: SenseDependencies = {
  git(args, cwd) {
    const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 256 * 1_024 * 1_024 });
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0] ?? ''} failed: ${result.stderr.trim()}`);
    return result.stdout;
  },
  runCheck(command, cwd, logPath) {
    const fd = openSync(logPath, 'w');
    try {
      const result = spawnSync(command, { cwd, shell: true, stdio: ['ignore', fd, fd] });
      if (result.error !== undefined) return { spawnError: describeError(result.error) };
      return { exitCode: result.status ?? 1 };
    } finally {
      closeSync(fd);
    }
  },
  runTool(command, args, cwd) {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1_024 * 1_024 });
    if (result.error !== undefined) return { spawnError: describeError(result.error) };
    return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
  },
};

/**
 * Runs every sensor and returns the sense document. A sensor that fails or does not apply is recorded with its status
 * and reason; only a failure to read the repository's `HEAD` or file list stops the run.
 */
export function runSense(options: SenseOptions, dependencies: SenseDependencies): SenseDocument {
  const { root, unit } = options;
  const commit = dependencies.git(['rev-parse', 'HEAD'], root).trim();
  const tracked = listFiles(dependencies, root, [unit]);
  const gitVersion = readGitVersion(dependencies, root);
  const outDir = path.dirname(options.out);

  const analyzable = listFiles(dependencies, root, [unit, ...buildExcludePathspecs(options.excludeGlobs)]);
  const { results: structural, graph } = runStructuralSensors(
    { root, unit, outDir, analyzable, unitTracked: tracked, excludeGlobs: options.excludeGlobs },
    dependencies,
  );
  const importers = graph === undefined ? undefined : new Map(graph.map((row) => [row.path, row.importers.length]));

  const sensors: SensorResult[] = [];
  let windowStart: string | null = null;
  try {
    const commits = parseNumstatLog(
      dependencies.git(buildLogArgs(unit, options.windowDays, options.excludeGlobs), root),
    );
    windowStart = commits.at(-1)?.date ?? null;
    const lineCounts = countLines(
      root,
      commits.flatMap((change) => change.files).filter((file) => tracked.has(file)),
    );
    sensors.push(
      buildSensorResult(
        'hotspots',
        gitVersion,
        'ok',
        null,
        null,
        addImporters(computeHotspots(commits, lineCounts), importers),
      ),
      buildSensorResult('co-change', gitVersion, 'ok', null, null, computeCoChange(commits, tracked)),
    );
  } catch (error) {
    const detail = describeError(error);
    sensors.push(
      buildSensorResult('hotspots', gitVersion, 'failed', detail, null, null),
      buildSensorResult('co-change', gitVersion, 'failed', detail, null, null),
    );
  }

  sensors.push(
    readReport('coverage', options.coverageSummary, root, (text) => parseCoverageSummary(JSON.parse(text), root, unit)),
    readReport('timings', options.junit, root, parseJunit),
    ...structural,
  );

  for (const check of options.checks) sensors.push(runCheckSensor(check, root, outDir, dependencies));

  return { unit, windowDays: options.windowDays, windowStart, commit, sensors };
}

// region | Helpers

/** Adds each hotspot's importer count, null when the graph does not list the file. */
function addImporters(
  rows: ReadonlyArray<Omit<HotspotRow, 'importers'>>,
  importers: ReadonlyMap<string, number> | undefined,
): HotspotRow[] {
  return rows.map((row) => ({ ...row, importers: importers?.get(row.path) ?? null }));
}

/** Counts the lines of each file that is present on disk, keyed by its repository-relative path. */
function countLines(root: string, files: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  const unique = new Set(files);
  for (const file of unique) {
    const absolute = path.join(root, file);
    if (!existsSync(absolute)) continue;
    const text = readFileSync(absolute, 'utf8');
    counts.set(file, text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0));
  }
  return counts;
}

/** Lists the tracked files that a pathspec selects, as root-relative paths. */
function listFiles(dependencies: SenseDependencies, root: string, pathspecs: readonly string[]): Set<string> {
  return new Set(
    dependencies
      .git(['ls-files', '-z', '--', ...pathspecs], root)
      .split('\0')
      .filter(Boolean),
  );
}

/** Returns the version that `git --version` reports, or null when it cannot be read. */
function readGitVersion(dependencies: SenseDependencies, root: string): string | null {
  try {
    return dependencies.git(['--version'], root).trim();
  } catch {
    return null;
  }
}

/** Reads and parses a report file; an absent flag is `not-applicable`, and an unreadable report is `failed`. */
function readReport(
  name: string,
  file: string | undefined,
  root: string,
  parse: (text: string) => unknown,
): SensorResult {
  if (file === undefined) return buildSensorResult(name, null, 'not-applicable', 'no report was given', null, null);
  const absolute = path.resolve(root, file);
  try {
    return buildSensorResult(name, null, 'ok', null, absolute, parse(readFileSync(absolute, 'utf8')));
  } catch (error) {
    return buildSensorResult(name, null, 'failed', describeError(error), absolute, null);
  }
}

/**
 * Runs one check and records its exit code. A non-zero exit is evidence rather than a sensor failure; a command that
 * could not be spawned, or that the shell could not find or execute (126, 127), is `failed`.
 */
function runCheckSensor(check: CheckSpec, root: string, outDir: string, dependencies: SenseDependencies): SensorResult {
  const logPath = path.join(outDir, `${check.name}.log`);
  const outcome = dependencies.runCheck(check.command, root, logPath);
  if ('spawnError' in outcome) return buildSensorResult(check.name, null, 'failed', outcome.spawnError, logPath, null);
  if (outcome.exitCode === 126 || outcome.exitCode === 127) {
    return buildSensorResult(check.name, null, 'failed', `the shell exited ${outcome.exitCode}`, logPath, null);
  }
  return buildSensorResult(check.name, null, 'ok', null, logPath, { exitCode: outcome.exitCode });
}

// endregion | Helpers
