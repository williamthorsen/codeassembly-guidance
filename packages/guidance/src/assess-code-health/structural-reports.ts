/** Parsers that turn the JSON output of knip, jscpd, and dependency-cruiser into sense-document rows. */
import path from 'node:path';

import { z } from 'zod';

/** One unused file, export, type, or dependency that knip reports. */
export interface DeadCodeRow {
  path: string;
  kind: string;
  name: string | null;
  line: number | null;
}

/** One end of a clone pair. */
export interface CloneLocation {
  path: string;
  startLine: number;
  endLine: number;
}

/** A clone pair that jscpd reports. */
export interface DuplicationRow {
  lines: number;
  tokens: number;
  a: CloneLocation;
  b: CloneLocation;
}

/** A module of the dependency graph, with the files that import it and the files that it imports. */
export interface GraphRow {
  path: string;
  importers: string[];
  imports: string[];
}

/** Reads dependency-cruiser's `json` output, whose paths are relative to the directory in which it ran. */
export function parseDependencyCruiserReport(json: unknown, root: string): GraphRow[] {
  return DependencyCruiserReportSchema.parse(json).modules.map((module) => ({
    path: toRootRelative(root, root, module.source),
    importers: (module.dependents ?? []).map((dependent) => toRootRelative(root, root, dependent)),
    imports: module.dependencies.flatMap(({ resolved }) =>
      resolved === undefined ? [] : toRootRelative(root, root, resolved),
    ),
  }));
}

/** Reads jscpd's `json` report written with `--absolute`. */
export function parseJscpdReport(json: unknown, root: string): DuplicationRow[] {
  return JscpdReportSchema.parse(json).duplicates.map((duplicate) => ({
    lines: duplicate.lines,
    tokens: duplicate.tokens,
    a: buildLocation(root, duplicate.firstFile),
    b: buildLocation(root, duplicate.secondFile),
  }));
}

/** Reads knip's `json` reporter output; every issue type is kept under its own key as `kind`. */
export function parseKnipReport(json: unknown, root: string): DeadCodeRow[] {
  const report = KnipReportSchema.parse(json);
  const rows: DeadCodeRow[] = [];
  for (const issue of report.issues) {
    const file = toRootRelative(root, root, issue.file);
    for (const [kind, value] of Object.entries(issue)) {
      if (kind === 'file' || kind === 'owners' || !Array.isArray(value)) continue;
      for (const entry of value) {
        const parsed = KnipEntrySchema.safeParse(entry);
        if (!parsed.success) continue;
        rows.push(buildDeadCodeRow(file, kind, parsed.data));
      }
    }
  }
  return rows;
}

/** Resolves a path that a tool reports relative to `base` and returns it relative to `root`, with `/` separators. */
export function toRootRelative(root: string, base: string, reported: string): string {
  return path.relative(root, path.resolve(base, reported)).split(path.sep).join('/');
}

// region | Helpers

const KnipItemSchema = z.object({ name: z.string(), line: z.number().int().optional() });

// knip lists `duplicates` as groups of exports, and every other issue type as single items.
const KnipEntrySchema = z.union([KnipItemSchema, z.array(KnipItemSchema).min(1)]);

const KnipReportSchema = z.object({ issues: z.array(z.looseObject({ file: z.string() })) });

const JscpdFileSchema = z.object({ name: z.string(), start: z.number().int(), end: z.number().int() });

const JscpdReportSchema = z.object({
  duplicates: z.array(
    z.object({
      lines: z.number().int(),
      tokens: z.number().int(),
      firstFile: JscpdFileSchema,
      secondFile: JscpdFileSchema,
    }),
  ),
});

const DependencyCruiserReportSchema = z.object({
  modules: z.array(
    z.object({
      source: z.string(),
      dependencies: z.array(z.object({ resolved: z.string().optional() })),
      dependents: z.array(z.string()).optional(),
    }),
  ),
});

/** Builds a dead-code row; a whole file has neither a name nor a line. */
function buildDeadCodeRow(file: string, kind: string, entry: z.infer<typeof KnipEntrySchema>): DeadCodeRow {
  if (kind === 'files') return { path: file, kind, name: null, line: null };
  const items = Array.isArray(entry) ? entry : [entry];
  return {
    path: file,
    kind,
    name: items.map((item) => item.name).join(', '),
    line: items[0]?.line ?? null,
  };
}

/** Builds a clone location from one side of a jscpd duplicate. */
function buildLocation(root: string, file: z.infer<typeof JscpdFileSchema>): CloneLocation {
  return { path: toRootRelative(root, root, file.name), startLine: file.start, endLine: file.end };
}

// endregion | Helpers
