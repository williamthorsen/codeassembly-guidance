/** Reads the project's declared stage from its own preferences file. */
import { isRecord } from '../lib/type-guards.ts';

// Each list runs from the least demanding value to the most demanding, the order in which the most demanding of
// several stages is chosen.
export const MATURITY_VALUES = ['exploration', 'hobby', 'early', 'production'] as const;
export const SENSITIVITY_VALUES = ['low', 'personal', 'confidential'] as const;
export const AUDIENCE_VALUES = ['owner', 'team', 'public'] as const;

/** The project's declared stage, each value `null` when the project file does not declare it. */
export interface ProjectStage {
  readonly maturity: (typeof MATURITY_VALUES)[number] | null;
  readonly sensitivity: (typeof SENSITIVITY_VALUES)[number] | null;
  readonly audience: (typeof AUDIENCE_VALUES)[number] | null;
}

/** The stage that a subdirectory declares under `project.stages`, with each undeclared value inherited. */
export interface SubdirectoryStage extends ProjectStage {
  /** Directory relative to the repository root, without a trailing `/`. */
  readonly path: string;
}

/**
 * Narrows the `project` section of the project preferences file to the declared stage. Throws, naming the key path and
 * the allowed values, when a declared value is outside its set.
 */
export function readProjectStage(projectPreferences: Record<string, unknown>): ProjectStage {
  const section = projectPreferences['project'];
  if (section === undefined) {
    return { maturity: null, sensitivity: null, audience: null };
  }
  if (!isRecord(section)) {
    throw new Error(`preferences: 'project' must be an object (got ${JSON.stringify(section)})`);
  }
  return {
    maturity: expectOneOf(section['maturity'], MATURITY_VALUES, 'project.maturity'),
    sensitivity: expectOneOf(section['sensitivity'], SENSITIVITY_VALUES, 'project.sensitivity'),
    audience: expectOneOf(section['audience'], AUDIENCE_VALUES, 'project.audience'),
  };
}

/**
 * Narrows `project.stages` to the declared subdirectory stages, each undeclared value taken from `repositoryStage`.
 * Throws, naming the indexed key path, on an entry without a path or with an absolute one, on a path that repeats an
 * earlier entry's, on a value outside its set, and on an entry that does not declare any stage key.
 */
export function readSubdirectoryStages(
  projectPreferences: Record<string, unknown>,
  repositoryStage: ProjectStage,
): SubdirectoryStage[] {
  const section = projectPreferences['project'];
  if (!isRecord(section) || section['stages'] === undefined || section['stages'] === null) {
    return [];
  }
  const entries = section['stages'];
  if (!Array.isArray(entries)) {
    throw new TypeError(`preferences: 'project.stages' must be an array (got ${JSON.stringify(entries)})`);
  }
  const stages = entries.map((entry, index) =>
    readSubdirectoryStage(entry, `project.stages[${index}]`, repositoryStage),
  );
  // Reject a repeated path, which would leave the longest containing path without a single winner
  const firstIndexByPath = new Map<string, number>();
  for (const [index, stage] of stages.entries()) {
    const firstIndex = firstIndexByPath.get(stage.path);
    if (firstIndex !== undefined) {
      throw new Error(
        `preferences: 'project.stages[${index}].path' repeats 'project.stages[${firstIndex}].path' (${JSON.stringify(stage.path)})`,
      );
    }
    firstIndexByPath.set(stage.path, index);
  }
  return stages;
}

// region | Helpers

/** Narrows `value` to one of `allowed`, or `null` when it is undeclared. */
function expectOneOf<T extends string>(value: unknown, allowed: readonly T[], keyPath: string): T | null {
  if (value === undefined || value === null) {
    return null;
  }
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new Error(
      `preferences: '${keyPath}' must be one of ${allowed.map((candidate) => `"${candidate}"`).join(', ')} (got ${JSON.stringify(value)})`,
    );
  }
  return match;
}

/** Narrows one `project.stages` entry, inheriting each undeclared value from `repositoryStage`. */
function readSubdirectoryStage(entry: unknown, keyPath: string, repositoryStage: ProjectStage): SubdirectoryStage {
  if (!isRecord(entry)) {
    throw new Error(`preferences: '${keyPath}' must be an object (got ${JSON.stringify(entry)})`);
  }
  const rawPath = entry['path'];
  const directory = typeof rawPath === 'string' ? rawPath.replace(/\/+$/, '') : '';
  if (directory === '') {
    throw new Error(
      `preferences: '${keyPath}.path' must be a non-empty directory path (got ${JSON.stringify(rawPath)})`,
    );
  }
  if (directory.startsWith('/')) {
    throw new Error(
      `preferences: '${keyPath}.path' must be relative to the repository root (got ${JSON.stringify(rawPath)})`,
    );
  }
  const maturity = expectOneOf(entry['maturity'], MATURITY_VALUES, `${keyPath}.maturity`);
  const sensitivity = expectOneOf(entry['sensitivity'], SENSITIVITY_VALUES, `${keyPath}.sensitivity`);
  const audience = expectOneOf(entry['audience'], AUDIENCE_VALUES, `${keyPath}.audience`);
  if (maturity === null && sensitivity === null && audience === null) {
    throw new Error(`preferences: '${keyPath}' must declare at least one of "maturity", "sensitivity", "audience"`);
  }
  return {
    path: directory,
    maturity: maturity ?? repositoryStage.maturity,
    sensitivity: sensitivity ?? repositoryStage.sensitivity,
    audience: audience ?? repositoryStage.audience,
  };
}

// endregion | Helpers
