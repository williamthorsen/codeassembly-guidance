import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { GhResult, GhRunner } from '../../shared/gh.ts';
import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';
import { type CommandDeps, runCommand } from '../cli.ts';

describe(runCommand, () => {
  it('passes a body that references only public repositories', async () => {
    const body = writeBody('Uses acme/lib.');

    const output = await runCommand(['--repo', 'acme/site', '--body-file', body], makeDeps({ 'acme/lib': 'PUBLIC' }));

    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe('');
    expect(JSON.parse(output.stdout)).toMatchObject({ refused: [], verdict: 'pass' });
  });

  it('refuses a title that references a private repository, naming it on stderr', async () => {
    const output = await runCommand(
      ['--repo', 'acme/site', '--title', 'Port acme/app#3'],
      makeDeps({ 'acme/app': 'PRIVATE' }),
    );

    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('check-public-references: acme/app is PRIVATE, and acme/site is public;');
    expect(JSON.parse(output.stdout)).toMatchObject({ refused: ['acme/app'], verdict: 'refuse' });
  });

  it('reads every body file', async () => {
    const first = writeBody('Uses acme/lib.');
    const second = writeBody('Uses acme/app.');

    const output = await runCommand(
      ['--repo', 'acme/site', '--body-file', first, '--body-file', second],
      makeDeps({ 'acme/lib': 'PUBLIC', 'acme/app': 'PRIVATE' }),
    );

    expect(output.exitCode).toBe(1);
    expect(JSON.parse(output.stdout)).toMatchObject({ refused: ['acme/app'] });
  });

  it.each([
    { name: 'a missing body file', argv: ['--body-file', '/nonexistent/body.md'], message: 'file not found' },
    { name: 'an empty body file', argv: ['--body-file', 'EMPTY'], message: 'file is empty' },
    { name: 'neither a title nor a body file', argv: ['--repo', 'acme/site'], message: 'give --title, --body-file' },
    { name: 'a malformed --repo', argv: ['--repo', 'site', '--title', 'x'], message: '--repo takes <owner>/<name>' },
    { name: 'a positional argument', argv: ['--title', 'x', 'extra'], message: 'unexpected argument: extra' },
    { name: 'an unknown flag', argv: ['--titel', 'x'], message: '--titel' },
  ])('exits 2 on $name, before any lookup', async ({ argv, message }) => {
    const empty = writeBody(' \n');
    const deps = makeDeps({});

    const output = await runCommand(
      argv.map((arg) => (arg === 'EMPTY' ? empty : arg)),
      deps,
    );

    expect(output.exitCode).toBe(2);
    expect(output.stderr).toContain(message);
    expect(output.stderr).toContain('usage: check-public-references');
    expect(output.stdout).toBe('');
  });

  it('prints help on stdout and exits 0', async () => {
    const output = await runCommand(['--help'], makeDeps({}));

    expect(output).toMatchObject({ exitCode: 0, stderr: '' });
    expect(output.stdout).toContain('usage: check-public-references');
  });

  it.each(['git@github.com:acme/site.git', 'https://github.com/acme/site.git', 'ssh://git@github.com/acme/site'])(
    'derives the GitHub target from the origin %s',
    async (url) => {
      const output = await runCommand(['--title', 'Port acme/app'], makeDeps({ 'acme/app': 'PRIVATE' }, url));

      expect(output.exitCode).toBe(1);
      expect(JSON.parse(output.stdout)).toMatchObject({ target: { kind: 'github', repo: 'acme/site' } });
    },
  );

  it.each([
    { name: 'an origin on another host', url: 'git@bitbucket.org:acme/site.git' },
    { name: 'no origin', url: null },
  ])('passes with $name as a non-GitHub target', async ({ url }) => {
    const output = await runCommand(['--title', 'Port acme/app#3'], makeDeps({ 'acme/app': 'PRIVATE' }, url));

    expect(output.exitCode).toBe(0);
    expect(JSON.parse(output.stdout)).toMatchObject({ target: { kind: 'other' }, verdict: 'pass' });
  });

  it('exits 1 when the target cannot be read', async () => {
    const deps: CommandDeps = {
      gh: () => Promise.resolve({ exitCode: 1, stderr: 'HTTP 401', stdout: '' }),
      readOriginUrl: () => Promise.resolve(undefined),
    };

    const output = await runCommand(['--repo', 'acme/site', '--title', 'x'], deps);

    expect(output).toStrictEqual({
      exitCode: 1,
      stderr: 'check-public-references: cannot read the visibility of acme/site: HTTP 401\n',
      stdout: '',
    });
  });
});

// region | Helpers

/**
 * Builds deps whose `gh` reports `acme/site` as public, the user as `me`, and each other repository with its
 * visibility in `visibilities`, or as not found when it is absent; `origin` defaults to `acme/site` on GitHub, and
 * null stands for a directory without one.
 */
function makeDeps(
  visibilities: Readonly<Record<string, 'PRIVATE' | 'PUBLIC'>>,
  originUrl: string | null = 'git@github.com:acme/site.git',
): CommandDeps {
  const gh: GhRunner = (args) => {
    const query = args.find((arg) => arg.startsWith('query=')) ?? '';
    if (query.includes('viewer')) {
      return Promise.resolve(respond({ repository: { visibility: 'PUBLIC' }, viewer: { login: 'me' } }));
    }
    const data: Record<string, { visibility: string } | null> = {};
    for (const [, alias = '', owner = '', name = ''] of query.matchAll(
      /(r\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g,
    )) {
      const visibility = visibilities[`${owner}/${name}`];
      data[alias] = visibility === undefined ? null : { visibility };
    }
    return Promise.resolve(respond(data));
  };
  return { gh, readOriginUrl: () => Promise.resolve(originUrl ?? undefined) };
}

/** Wraps `data` in a successful GraphQL response. */
function respond(data: Record<string, unknown>): GhResult {
  return { exitCode: 0, stderr: '', stdout: JSON.stringify({ data }) };
}

/** Writes `body` to a file in a scratch directory and returns its path. */
function writeBody(body: string): string {
  const path = join(makeScratchDir('check-public-references-'), 'body.md');
  writeFileSync(path, body);
  return path;
}

// endregion | Helpers
