/** The dead-code, duplication, and dependency-graph sensors, which run third-party tools over the unit. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { buildSensorResult, type SensorResult } from './schemas.ts';
import type { SenseDependencies } from './sense.ts';
import {
  type DeadCodeRow,
  type DuplicationRow,
  type GraphRow,
  parseDependencyCruiserReport,
  parseJscpdReport,
  parseKnipReport,
} from './structural-reports.ts';

/** The dependency-cruiser release that runs when the project lacks a copy; its `json` output has `modules[].dependents`. */
export const DEPENDENCY_CRUISER_VERSION = '18.7.2';

/** The jscpd release that runs when the project lacks a copy; its `json` report lists `duplicates[]` with 1-based lines. */
export const JSCPD_VERSION = '5.4.2';

/** The knip release that runs when the project lacks a copy; its `json` reporter lists `issues[]` keyed by issue type. */
export const KNIP_VERSION = '6.44.1';

/** The rows of the duplication sensor beyond which the smaller clone pairs are dropped. */
export const MAX_DUPLICATION_ROWS = 100;

/** The names of the structural sensors, in the order that `sense` records them. */
export const STRUCTURAL_SENSOR_NAMES = ['dead-code', 'duplication', 'dependency-graph'] as const;

/**
 * The TypeScript release that a pinned dependency-cruiser loads to parse TypeScript sources; dependency-cruiser 18
 * supports TypeScript below 7.
 */
export const TYPESCRIPT_VERSION = '6.0.3';

/** What the structural sensors read and where they write. */
export interface StructuralOptions {
  root: string;
  unit: string;
  /** The directory of the sense document, beside which each tool's raw output is written. */
  outDir: string;
  /** The unit's tracked files, less the exclusions: the only paths that a row may name. */
  analyzable: ReadonlySet<string>;
  /** Every tracked file under the unit, which admits a manifest that the exclusions remove. */
  unitTracked: ReadonlySet<string>;
  excludeGlobs: readonly string[];
}

/** The structural sensors' results, and the graph rows when the dependency-graph sensor is `ok`. */
export interface StructuralResults {
  results: SensorResult[];
  graph: GraphRow[] | undefined;
}

/** Runs the three structural sensors. Each one that fails or does not apply is recorded and does not stop the others. */
export function runStructuralSensors(options: StructuralOptions, dependencies: SenseDependencies): StructuralResults {
  const deadCode = runStructuralTool(DEAD_CODE_TOOL, options, dependencies);
  const duplication = runStructuralTool(DUPLICATION_TOOL, options, dependencies);
  const graph = runStructuralTool(DEPENDENCY_GRAPH_TOOL, options, dependencies);
  return { results: [deadCode.result, duplication.result, graph.result], graph: graph.rows };
}

// region | Helpers

/** How one sensor runs its tool and reads the result. */
interface ToolSpec<Row> {
  name: (typeof STRUCTURAL_SENSOR_NAMES)[number];
  bin: string;
  packages: readonly string[];
  pinnedVersion: string;
  needsScript: boolean;
  buildArgs(options: StructuralOptions): string[];
  /** Returns the path of the raw output, writing it from stdout when the tool does not write a file itself. */
  saveOutput(stdout: string, options: StructuralOptions): string;
  parse(json: unknown, options: StructuralOptions): Row[];
}

const SCRIPT_PATTERN = /\.[cm]?[jt]sx?$/;

const STDERR_EXCERPT_LENGTH = 500;

const DEAD_CODE_TOOL: ToolSpec<DeadCodeRow> = {
  name: 'dead-code',
  bin: 'knip',
  packages: [`knip@${KNIP_VERSION}`],
  pinnedVersion: KNIP_VERSION,
  needsScript: true,
  buildArgs: () => ['--reporter', 'json', '--no-progress', '--no-exit-code'],
  saveOutput: (stdout, { outDir }) => writeOutput(outDir, 'dead-code.json', stdout),
  parse: (json, options) => filterDeadCode(parseKnipReport(json, options.root), options),
};

const DEPENDENCY_GRAPH_TOOL: ToolSpec<GraphRow> = {
  name: 'dependency-graph',
  bin: 'depcruise',
  packages: [`dependency-cruiser@${DEPENDENCY_CRUISER_VERSION}`, `typescript@${TYPESCRIPT_VERSION}`],
  pinnedVersion: DEPENDENCY_CRUISER_VERSION,
  needsScript: true,
  buildArgs: ({ root, unit }) => [
    unit,
    '--output-type',
    'json',
    '--no-config',
    '--do-not-follow',
    'node_modules',
    ...findTsConfig(root, unit),
  ],
  saveOutput: (stdout, { outDir }) => writeOutput(outDir, 'dependency-graph.json', stdout),
  parse: (json, options) => filterGraph(parseDependencyCruiserReport(json, options.root), options.analyzable),
};

const DUPLICATION_TOOL: ToolSpec<DuplicationRow> = {
  name: 'duplication',
  bin: 'jscpd',
  packages: [`jscpd@${JSCPD_VERSION}`],
  pinnedVersion: JSCPD_VERSION,
  needsScript: false,
  buildArgs: ({ unit, outDir, excludeGlobs }) => [
    unit,
    '--reporters',
    'json',
    '--output',
    path.join(outDir, 'jscpd'),
    '--silent',
    '--absolute',
    ...(excludeGlobs.length > 0 ? ['--ignore', excludeGlobs.join(',')] : []),
  ],
  saveOutput: (_stdout, { outDir }) => path.join(outDir, 'jscpd', 'jscpd-report.json'),
  parse: (json, options) => filterDuplication(parseJscpdReport(json, options.root), options.analyzable),
};

/**
 * Builds the `pnpm dlx` arguments for the pinned release. The cache lives under the temporary directory because an
 * agent sandbox commonly refuses writes to pnpm's default cache.
 */
function buildDlxArgs(tool: ToolSpec<unknown>, toolArgs: readonly string[]): string[] {
  return [
    `--config.cache-dir=${path.join(tmpdir(), 'assess-code-health-pnpm-cache')}`,
    'dlx',
    ...tool.packages.flatMap((pkg) => ['--package', pkg]),
    tool.bin,
    ...toolArgs,
  ];
}

/** Keeps the rows that name an analyzable file, or a manifest tracked under the unit. */
function filterDeadCode(rows: readonly DeadCodeRow[], options: StructuralOptions): DeadCodeRow[] {
  return rows.filter(
    (row) =>
      options.analyzable.has(row.path) ||
      (path.posix.basename(row.path) === 'package.json' && options.unitTracked.has(row.path)),
  );
}

/** Keeps the clone pairs whose two sides are analyzable, largest first, at most `MAX_DUPLICATION_ROWS`. */
function filterDuplication(rows: readonly DuplicationRow[], analyzable: ReadonlySet<string>): DuplicationRow[] {
  return rows
    .filter((row) => analyzable.has(row.a.path) && analyzable.has(row.b.path))
    .toSorted(
      (left, right) =>
        right.lines - left.lines || left.a.path.localeCompare(right.a.path) || left.b.path.localeCompare(right.b.path),
    )
    .slice(0, MAX_DUPLICATION_ROWS);
}

/** Keeps the analyzable modules, with their importers and imports limited to analyzable files. */
function filterGraph(rows: readonly GraphRow[], analyzable: ReadonlySet<string>): GraphRow[] {
  return rows
    .filter((row) => analyzable.has(row.path))
    .map((row) => ({
      path: row.path,
      importers: row.importers.filter((file) => analyzable.has(file)).toSorted(),
      imports: row.imports.filter((file) => analyzable.has(file)).toSorted(),
    }))
    .toSorted((left, right) => left.path.localeCompare(right.path));
}

/** Returns the `--ts-config` flag for the unit's `tsconfig.json`, else the root's, or nothing when neither exists. */
function findTsConfig(root: string, unit: string): string[] {
  for (const candidate of [path.join(unit, 'tsconfig.json'), 'tsconfig.json']) {
    if (existsSync(path.join(root, candidate))) return ['--ts-config', candidate];
  }
  return [];
}

/** Returns the trimmed last line of a `--version` output, or null when the read fails. */
function readProjectVersion(command: string, root: string, dependencies: SenseDependencies): string | null {
  const outcome = dependencies.runTool(command, ['--version'], root);
  if ('spawnError' in outcome || outcome.exitCode !== 0) return null;
  return outcome.stdout.trim().split('\n').at(-1)?.trim() || null;
}

/** Runs one tool and records its rows, or the reason that it failed or does not apply. */
function runStructuralTool<Row>(
  tool: ToolSpec<Row>,
  options: StructuralOptions,
  dependencies: SenseDependencies,
): { result: SensorResult; rows: Row[] | undefined } {
  const { root, analyzable } = options;
  const files = [...analyzable];
  const missing = tool.needsScript ? files.every((file) => !SCRIPT_PATTERN.test(file)) : files.length === 0;
  if (missing) {
    const detail = tool.needsScript ? 'the unit has no JavaScript or TypeScript files' : 'the unit has no files';
    return { result: buildSensorResult(tool.name, null, 'not-applicable', detail, null, null), rows: undefined };
  }

  const projectBin = path.join(root, 'node_modules', '.bin', tool.bin);
  const useProject = existsSync(projectBin);
  const version = useProject ? readProjectVersion(projectBin, root, dependencies) : tool.pinnedVersion;
  const toolArgs = tool.buildArgs(options);
  const outcome = useProject
    ? dependencies.runTool(projectBin, toolArgs, root)
    : dependencies.runTool('pnpm', buildDlxArgs(tool, toolArgs), root);
  if ('spawnError' in outcome) {
    return { result: buildSensorResult(tool.name, version, 'failed', outcome.spawnError, null, null), rows: undefined };
  }

  let outputPath: string | null = null;
  try {
    outputPath = tool.saveOutput(outcome.stdout, options);
    const rows = tool.parse(JSON.parse(readFileSync(outputPath, 'utf8')), options);
    return { result: buildSensorResult(tool.name, version, 'ok', null, outputPath, rows), rows };
  } catch (error) {
    const stderr = outcome.stderr.trim().slice(0, STDERR_EXCERPT_LENGTH);
    const detail = `${tool.bin} exited ${outcome.exitCode}: ${describeError(error)}${stderr === '' ? '' : `; stderr: ${stderr}`}`;
    return { result: buildSensorResult(tool.name, version, 'failed', detail, outputPath, null), rows: undefined };
  }
}

/** Writes a tool's stdout beside the sense document and returns its path. */
function writeOutput(outDir: string, fileName: string, stdout: string): string {
  mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, fileName);
  writeFileSync(outputPath, stdout, 'utf8');
  return outputPath;
}

// endregion | Helpers
