import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseDependencyCruiserReport,
  parseJscpdReport,
  parseKnipReport,
  toRootRelative,
} from '../structural-reports.ts';

const SRC = 'packages/guidance/src/assess-code-health';

describe('parseDependencyCruiserReport', () => {
  it('lists each module with its importers and resolved imports, dropping unresolved specifiers', () => {
    const rows = parseDependencyCruiserReport(readFixture('dependency-cruiser-18.7.2.json'), '/repo');

    expect(rows.find((row) => row.path === `${SRC}/sense.ts`)).toEqual({
      path: `${SRC}/sense.ts`,
      importers: [`${SRC}/cli.ts`, `${SRC}/test-utils/build-context.ts`],
      imports: [`${SRC}/git-history.ts`, `${SRC}/test-reports.ts`, '@williamthorsen/toolbelt.errors'],
    });
  });

  it('rejects output without modules', () => {
    expect(() => parseDependencyCruiserReport({ summary: {} }, '/repo')).toThrow();
  });
});

describe('parseJscpdReport', () => {
  it('reads both sides of each clone pair as root-relative locations', () => {
    const [row] = parseJscpdReport(readFixture('jscpd-5.4.2.json'), '/repo');

    expect(row).toMatchObject({
      lines: 19,
      a: { path: `${SRC}/sense.ts` },
      b: { path: `${SRC}/structural-sensors.ts` },
    });
    expect(row?.a.endLine).toBeGreaterThan(row?.a.startLine ?? Infinity);
  });
});

describe('parseKnipReport', () => {
  it('reads every issue type as a row, with a whole file lacking a name and a line', () => {
    const rows = parseKnipReport(readFixture('knip-6.44.1.json'), '/repo');

    expect(rows.map((row) => row.kind).toSorted()).toEqual(['devDependencies', 'exports', 'files', 'types']);
    expect(rows.find((row) => row.kind === 'files')).toEqual({
      path: 'taze.config.ts',
      kind: 'files',
      name: null,
      line: null,
    });
    expect(rows.find((row) => row.kind === 'devDependencies')).toMatchObject({ path: 'package.json', line: 31 });
  });

  it('joins the names of a duplicate group into one row', () => {
    const rows = parseKnipReport(
      { issues: [{ file: 'a.ts', duplicates: [[{ name: 'one' }, { name: 'two', line: 4 }]] }] },
      '/repo',
    );

    expect(rows).toEqual([{ path: 'a.ts', kind: 'duplicates', name: 'one, two', line: null }]);
  });
});

describe('toRootRelative', () => {
  it('resolves a path against its base and returns it relative to the root', () => {
    expect(toRootRelative('/repo', '/repo/pkg', 'src/a.ts')).toBe('pkg/src/a.ts');
    expect(toRootRelative('/repo', '/repo', '/repo/pkg/b.ts')).toBe('pkg/b.ts');
  });
});

// region | Helpers

/** Reads a captured tool output from the fixtures directory. */
function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8'));
}

// endregion | Helpers
