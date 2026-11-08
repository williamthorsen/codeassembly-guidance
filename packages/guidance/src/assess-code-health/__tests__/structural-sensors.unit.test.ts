import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';
import type { SensorResult } from '../schemas.ts';
import type { SenseDependencies, ToolOutcome } from '../sense.ts';
import {
  DEPENDENCY_CRUISER_VERSION,
  JSCPD_VERSION,
  KNIP_VERSION,
  runStructuralSensors,
  type StructuralOptions,
  TYPESCRIPT_VERSION,
} from '../structural-sensors.ts';

const SRC = 'packages/guidance/src/assess-code-health';

describe('runStructuralSensors', () => {
  let root: string;
  let calls: Array<{ command: string; args: readonly string[] }>;

  beforeEach(() => {
    root = makeScratchDir('code-health-structural-');
    calls = [];
  });

  it('records every sensor as not applicable when the unit has no files', () => {
    const { results } = runStructuralSensors(
      buildOptions({ analyzable: [] }),
      buildDependencies(() => fail()),
    );

    expect(results.map(({ name, status }) => [name, status])).toEqual([
      ['dead-code', 'not-applicable'],
      ['duplication', 'not-applicable'],
      ['dependency-graph', 'not-applicable'],
    ]);
  });

  it('runs only duplication when the unit has no JavaScript or TypeScript files', () => {
    const { results } = runStructuralSensors(
      buildOptions({ analyzable: ['pkg/run.py'] }),
      buildDependencies(() => fail()),
    );

    expect(findResult(results, 'dead-code')).toMatchObject({
      status: 'not-applicable',
      detail: 'the unit has no JavaScript or TypeScript files',
    });
    expect(findResult(results, 'duplication').status).toBe('failed');
    expect(calls.map(({ args }) => args.includes('jscpd'))).toEqual([true]);
  });

  it('runs the pinned releases through pnpm dlx and records the pins as versions', () => {
    const { results } = runStructuralSensors(buildOptions(), buildDependencies(answerWithFixtures));

    const knipCall = calls.find(({ args }) => args.includes('knip'));
    expect(knipCall?.command).toBe('pnpm');
    expect(knipCall?.args).toEqual(expect.arrayContaining(['dlx', '--package', `knip@${KNIP_VERSION}`]));
    const graphCall = calls.find(({ args }) => args.includes('depcruise'));
    expect(graphCall?.args).toEqual(
      expect.arrayContaining([`dependency-cruiser@${DEPENDENCY_CRUISER_VERSION}`, `typescript@${TYPESCRIPT_VERSION}`]),
    );
    expect(results.map(({ status, version }) => [status, version])).toEqual([
      ['ok', KNIP_VERSION],
      ['ok', JSCPD_VERSION],
      ['ok', DEPENDENCY_CRUISER_VERSION],
    ]);
  });

  it('keeps only rows that name analyzable files, and dependency rows of a manifest under the unit', () => {
    const { results, graph } = runStructuralSensors(
      buildOptions({
        unit: 'packages/guidance',
        analyzable: [`${SRC}/sense.ts`, `${SRC}/cli.ts`, `${SRC}/git-history.ts`],
        unitTracked: ['packages/guidance/package.json'],
      }),
      buildDependencies((command, args) =>
        args.includes('knip')
          ? succeed(
              JSON.stringify({
                issues: [
                  { file: `${SRC}/sense.ts`, exports: [{ name: 'kept', line: 3 }] },
                  { file: 'taze.config.ts', files: [{ name: 'taze.config.ts' }] },
                  { file: 'packages/guidance/package.json', devDependencies: [{ name: 'unused', line: 9 }] },
                  { file: 'package.json', devDependencies: [{ name: 'outside', line: 2 }] },
                ],
              }),
            )
          : answerWithFixtures(command, args),
      ),
    );

    expect(findResult(results, 'dead-code').data).toEqual([
      { path: `${SRC}/sense.ts`, kind: 'exports', name: 'kept', line: 3 },
      { path: 'packages/guidance/package.json', kind: 'devDependencies', name: 'unused', line: 9 },
    ]);
    expect(findResult(results, 'duplication').data).toEqual([]);
    expect(findResult(results, 'dependency-graph').data).toEqual([
      { path: `${SRC}/cli.ts`, importers: [], imports: [] },
      { path: `${SRC}/git-history.ts`, importers: [`${SRC}/sense.ts`], imports: [] },
      { path: `${SRC}/sense.ts`, importers: [`${SRC}/cli.ts`], imports: [`${SRC}/git-history.ts`] },
    ]);
    expect(graph).toEqual(findResult(results, 'dependency-graph').data);
  });

  it('runs a project-installed copy and records the version that it reports', () => {
    installProjectBin('knip');
    installProjectBin('depcruise');
    const { results } = runStructuralSensors(
      buildOptions(),
      buildDependencies((command, args) => {
        if (args[0] === '--version') return command.endsWith('knip') ? succeed('knip\n6.0.0\n') : fail();
        return answerWithFixtures(command, args);
      }),
    );

    expect(calls.find(({ command }) => command.endsWith('knip'))?.command).toBe(
      path.join(root, 'node_modules', '.bin', 'knip'),
    );
    expect(findResult(results, 'dead-code')).toMatchObject({ status: 'ok', version: '6.0.0' });
    expect(findResult(results, 'dependency-graph')).toMatchObject({ status: 'ok', version: null });
  });

  it('records a tool that cannot spawn, or whose output does not parse, as failed with its reason', () => {
    const { results, graph } = runStructuralSensors(
      buildOptions(),
      buildDependencies((_command, args) =>
        args.includes('knip')
          ? { exitCode: 2, stdout: 'not json', stderr: 'knip: config error' }
          : { spawnError: 'spawn pnpm ENOENT' },
      ),
    );

    const deadCode = findResult(results, 'dead-code');
    expect(deadCode).toMatchObject({ status: 'failed', data: null });
    expect(deadCode.detail).toContain('knip exited 2');
    expect(deadCode.detail).toContain('knip: config error');
    expect(readFileSync(deadCode.outputPath ?? '', 'utf8')).toBe('not json');
    expect(findResult(results, 'duplication')).toMatchObject({ status: 'failed', detail: 'spawn pnpm ENOENT' });
    expect(graph).toBeUndefined();
  });

  it('records duplication as failed when jscpd writes no report, whatever an earlier run left', () => {
    const staleDir = path.join(root, 'out', 'jscpd');
    mkdirSync(staleDir, { recursive: true });
    writeFileSync(
      path.join(staleDir, 'jscpd-report.json'),
      readFixtureText('jscpd-5.4.2.json').replaceAll('/repo/', () => `${root}/`),
    );
    const { results } = runStructuralSensors(
      buildOptions(),
      buildDependencies((command, args) =>
        args.includes('jscpd')
          ? { exitCode: 1, stdout: '', stderr: 'jscpd crashed' }
          : answerWithFixtures(command, args),
      ),
    );

    expect(findResult(results, 'duplication')).toMatchObject({ status: 'failed', data: null });
  });

  /** Builds options over the fixture paths, rooted at the scratch directory. */
  function buildOptions(
    overrides: { unit?: string; analyzable?: string[]; unitTracked?: string[] } = {},
  ): StructuralOptions {
    const analyzable = overrides.analyzable ?? [`${SRC}/sense.ts`, `${SRC}/structural-sensors.ts`];
    return {
      root,
      unit: overrides.unit ?? 'packages/guidance',
      outDir: path.join(root, 'out'),
      analyzable: new Set(analyzable),
      unitTracked: new Set([...analyzable, ...(overrides.unitTracked ?? [])]),
      excludeGlobs: [],
    };
  }

  /** Builds sense dependencies whose `runTool` records each call and answers with `answer`. */
  function buildDependencies(answer: (command: string, args: readonly string[]) => ToolOutcome): SenseDependencies {
    return {
      git: () => {
        throw new Error('git must not run');
      },
      runCheck: () => {
        throw new Error('no check may run');
      },
      runTool: (command, args) => {
        calls.push({ command, args });
        return answer(command, args);
      },
    };
  }

  /** Answers a tool call with its captured fixture; jscpd's report is written where `--output` names. */
  function answerWithFixtures(_command: string, args: readonly string[]): ToolOutcome {
    if (args.includes('--version')) return fail();
    if (args.includes('--reporters')) {
      const outputDir = args[args.indexOf('--output') + 1] ?? '';
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(
        path.join(outputDir, 'jscpd-report.json'),
        readFixtureText('jscpd-5.4.2.json').replaceAll('/repo/', () => `${root}/`),
      );
      return succeed('');
    }
    if (args.includes('--output-type')) return succeed(readFixtureText('dependency-cruiser-18.7.2.json'));
    return succeed(readFixtureText('knip-6.44.1.json'));
  }

  /** Creates an executable placeholder for a project-installed tool. */
  function installProjectBin(bin: string): void {
    const binDir = path.join(root, 'node_modules', '.bin');
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(binDir, bin), '');
  }
});

// region | Helpers

/** Returns a spawn failure. */
function fail(): ToolOutcome {
  return { spawnError: 'not expected' };
}

/** Returns the named sensor result, failing the test when it is missing. */
function findResult(results: readonly SensorResult[], name: string): SensorResult {
  const result = results.find((candidate) => candidate.name === name);
  if (result === undefined) throw new Error(`sensor ${name} is missing`);
  return result;
}

/** Reads a captured tool output from the fixtures directory. */
function readFixtureText(name: string): string {
  return readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8');
}

/** Returns a successful run with the given stdout. */
function succeed(stdout: string): ToolOutcome {
  return { exitCode: 0, stdout, stderr: '' };
}

// endregion | Helpers
