import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isRecord } from '../../lib/type-guards.ts';
import {
  AUDIENCE_VALUES,
  MATURITY_VALUES,
  type ProjectStage,
  readProjectStage,
  readSubdirectoryStages,
  SENSITIVITY_VALUES,
} from '../read-project-stage.ts';

const REPOSITORY_STAGE: ProjectStage = { maturity: 'early', sensitivity: 'low', audience: null };

const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../schemas/preferences.v1.json');

describe(readProjectStage, () => {
  it('returns every value as null when the file does not have a `project` section', () => {
    expect(readProjectStage({})).toEqual({ maturity: null, sensitivity: null, audience: null });
  });

  it('returns the declared values and null for each undeclared one', () => {
    expect(readProjectStage({ project: { slug: 'x', maturity: 'early', sensitivity: 'personal' } })).toEqual({
      maturity: 'early',
      sensitivity: 'personal',
      audience: null,
    });
  });

  it('throws on a value outside its set, naming the key path and the allowed values', () => {
    expect(() => readProjectStage({ project: { audience: 'everyone' } })).toThrow(
      `preferences: 'project.audience' must be one of "owner", "team", "public" (got "everyone")`,
    );
  });

  it('throws when `project` is not an object', () => {
    expect(() => readProjectStage({ project: 'x' })).toThrow(/'project' must be an object/);
  });

  it('accepts exactly the values that the preferences schema declares', () => {
    const projectProperties = readSchemaProjectProperties();
    expect(MATURITY_VALUES).toEqual(projectProperties['maturity']);
    expect(SENSITIVITY_VALUES).toEqual(projectProperties['sensitivity']);
    expect(AUDIENCE_VALUES).toEqual(projectProperties['audience']);
  });
});

describe(readSubdirectoryStages, () => {
  it('returns an empty list when the project does not declare any stages', () => {
    expect(readSubdirectoryStages({}, REPOSITORY_STAGE)).toEqual([]);
    expect(readSubdirectoryStages({ project: { maturity: 'early' } }, REPOSITORY_STAGE)).toEqual([]);
  });

  it("inherits each undeclared value from the repository's stage and trims a trailing slash", () => {
    const preferences = {
      project: {
        stages: [
          { path: 'experiments/', maturity: 'exploration' },
          { path: 'apps/web', audience: 'public' },
        ],
      },
    };
    expect(readSubdirectoryStages(preferences, REPOSITORY_STAGE)).toEqual([
      { path: 'experiments', maturity: 'exploration', sensitivity: 'low', audience: null },
      { path: 'apps/web', maturity: 'early', sensitivity: 'low', audience: 'public' },
    ]);
  });

  it.each([
    ['is not an array', { stages: 'x' }, `'project.stages' must be an array`],
    ['has an entry that is not an object', { stages: ['x'] }, `'project.stages[0]' must be an object`],
    ['has an entry without a path', { stages: [{ maturity: 'hobby' }] }, `'project.stages[0].path' must be`],
    [
      'has an entry whose path is only a slash',
      { stages: [{ path: '/', maturity: 'hobby' }] },
      `'project.stages[0].path' must be`,
    ],
    [
      'has an entry with a value outside its set',
      {
        stages: [
          { path: 'a', maturity: 'hobby' },
          { path: 'b', maturity: 'enterprise' },
        ],
      },
      `'project.stages[1].maturity' must be one of`,
    ],
    [
      'has an entry that does not declare any stage key',
      { stages: [{ path: 'a' }] },
      `'project.stages[0]' must declare at least one of "maturity", "sensitivity", "audience"`,
    ],
  ])('throws, naming the key path, when `project.stages` %s', (_label, project, message) => {
    expect(() => readSubdirectoryStages({ project }, REPOSITORY_STAGE)).toThrow(message);
  });

  it('accepts exactly the values that the schema declares for a `project.stages` entry', () => {
    const entryProperties = readSchemaStageEntryProperties();
    expect(MATURITY_VALUES).toEqual(entryProperties['maturity']);
    expect(SENSITIVITY_VALUES).toEqual(entryProperties['sensitivity']);
    expect(AUDIENCE_VALUES).toEqual(entryProperties['audience']);
  });
});

// region | Helpers

/** Reads the `enum` of each stage key under the schema's `project.properties`. */
function readSchemaProjectProperties(): Record<string, unknown> {
  const schema: unknown = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const properties = readPath(schema, ['properties', 'project', 'properties']);
  const result: Record<string, unknown> = {};
  for (const key of ['maturity', 'sensitivity', 'audience']) {
    result[key] = readPath(properties, [key, 'enum']);
  }
  return result;
}

/** Reads the `enum` of each stage key under the schema's `project.stages` entry. */
function readSchemaStageEntryProperties(): Record<string, unknown> {
  const schema: unknown = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const properties = readPath(schema, ['properties', 'project', 'properties', 'stages', 'items', 'properties']);
  const result: Record<string, unknown> = {};
  for (const key of ['maturity', 'sensitivity', 'audience']) {
    result[key] = readPath(properties, [key, 'enum']);
  }
  return result;
}

/** Follows `keys` through nested objects, returning `undefined` at the first missing step. */
function readPath(value: unknown, keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    current = isRecord(current) ? current[key] : undefined;
  }
  return current;
}

// endregion | Helpers
