import { describe, expect, it } from 'vitest';

import type { GhResult, GhRunner } from '../../shared/gh.ts';
import { checkPublicReferences } from '../check-public-references.ts';

const TARGET = { kind: 'github', repo: 'acme/site' } as const;

describe(checkPublicReferences, () => {
  it('passes a public target whose references are all public', async () => {
    const { gh } = makeGh({ 'acme/site': 'PUBLIC', 'acme/lib': 'PUBLIC', 'other/tool': 'PUBLIC' });

    const result = await checkPublicReferences(TARGET, 'Uses acme/lib and other/tool#4.', gh);

    expect(result).toStrictEqual({
      references: [
        { repo: 'acme/lib', visibility: 'PUBLIC' },
        { repo: 'other/tool', visibility: 'PUBLIC' },
      ],
      refused: [],
      target: { kind: 'github', repo: 'acme/site', visibility: 'PUBLIC' },
      verdict: 'pass',
    });
  });

  it.each([
    { visibility: 'PRIVATE', expected: 'PRIVATE' },
    { visibility: 'INTERNAL', expected: 'INTERNAL' },
    { visibility: undefined, expected: 'UNVERIFIED' },
  ] as const)('refuses a reference that GitHub reports as $expected', async ({ visibility, expected }) => {
    const { gh } = makeGh({ 'acme/site': 'PUBLIC', 'acme/lib': 'PUBLIC', 'acme/app': visibility });

    const result = await checkPublicReferences(TARGET, 'See acme/lib and acme/app#2.', gh);

    expect(result.verdict).toBe('refuse');
    expect(result.refused).toStrictEqual(['acme/app']);
    expect(result.references).toContainEqual({ repo: 'acme/app', visibility: expected });
  });

  it("counts a bare reference under the authenticated user's login", async () => {
    const { gh } = makeGh({ 'acme/site': 'PUBLIC', 'me/notes': 'PRIVATE' });

    const result = await checkPublicReferences(TARGET, 'Copied from me/notes.', gh);

    expect(result.refused).toStrictEqual(['me/notes']);
  });

  it('marks every reference unverified when the lookup does not return a response', async () => {
    const gh: GhRunner = (args) =>
      Promise.resolve(
        readQuery(args).includes('viewer')
          ? respond({ repository: { visibility: 'PUBLIC' }, viewer: { login: 'me' } })
          : { exitCode: 1, stderr: 'HTTP 502', stdout: '' },
      );

    const result = await checkPublicReferences(TARGET, 'See acme/lib.', gh);

    expect(result.references).toStrictEqual([{ repo: 'acme/lib', visibility: 'UNVERIFIED' }]);
    expect(result.verdict).toBe('refuse');
  });

  it.each(['PRIVATE', 'INTERNAL'] as const)('passes a %s target without looking up references', async (visibility) => {
    const { calls, gh } = makeGh({ 'acme/site': visibility, 'acme/app': 'PRIVATE' });

    const result = await checkPublicReferences(TARGET, 'See acme/app.', gh);

    expect(result.verdict).toBe('pass');
    expect(calls).toHaveLength(1);
  });

  it('passes a non-GitHub target without any lookup', async () => {
    const { calls, gh } = makeGh({});

    const result = await checkPublicReferences({ kind: 'other' }, 'See acme/app#1.', gh);

    expect(result).toStrictEqual({
      references: [],
      refused: [],
      target: { kind: 'other', repo: null, visibility: null },
      verdict: 'pass',
    });
    expect(calls).toHaveLength(0);
  });

  it('does not look up the target when the text names it', async () => {
    const { calls, gh } = makeGh({ 'acme/site': 'PUBLIC' });

    const result = await checkPublicReferences(TARGET, 'Fixes Acme/Site#3.', gh);

    expect(result.references).toStrictEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('splits more than 100 references into several lookups', async () => {
    const visibilities = Object.fromEntries(
      Array.from({ length: 150 }, (_, index) => [`other/repo${index}`, 'PUBLIC' as const]),
    );
    const { calls, gh } = makeGh({ 'acme/site': 'PUBLIC', ...visibilities });
    const text = Object.keys(visibilities)
      .map((repo) => `${repo}#1`)
      .join(' ');

    const result = await checkPublicReferences(TARGET, text, gh);

    expect(result.verdict).toBe('pass');
    expect(result.references).toHaveLength(150);
    expect(calls).toHaveLength(3);
  });

  it('throws when the target cannot be read', async () => {
    const gh: GhRunner = () => Promise.resolve({ exitCode: 4, stderr: 'gh auth login required', stdout: '' });

    await expect(checkPublicReferences(TARGET, 'text', gh)).rejects.toThrow(
      'cannot read the visibility of acme/site: gh auth login required',
    );
  });
});

// region | Helpers

/**
 * Builds a `gh` fake that answers the target query as user `me` and each aliased repository with its visibility in
 * `visibilities`, or with null and a non-zero exit when the repository is absent from it, as GitHub does.
 */
function makeGh(visibilities: Readonly<Record<string, 'INTERNAL' | 'PRIVATE' | 'PUBLIC' | undefined>>): {
  calls: string[];
  gh: GhRunner;
} {
  const calls: string[] = [];
  const lookUp = (repo: string): { visibility: string } | null => {
    const visibility = visibilities[repo];
    return visibility === undefined ? null : { visibility };
  };
  const gh: GhRunner = (args) => {
    const query = readQuery(args);
    calls.push(query);
    if (query.includes('viewer')) {
      const owner = readField(args, 'owner');
      const name = readField(args, 'name');
      return Promise.resolve(respond({ repository: lookUp(`${owner}/${name}`), viewer: { login: 'me' } }));
    }
    const data: Record<string, { visibility: string } | null> = {};
    for (const [, alias = '', owner = '', name = ''] of query.matchAll(
      /(r\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g,
    )) {
      data[alias] = lookUp(`${owner}/${name}`);
    }
    const response = respond(data);
    return Promise.resolve(Object.values(data).includes(null) ? { ...response, exitCode: 1 } : response);
  };
  return { calls, gh };
}

/** Reads the value of a `-f key=value` field from `gh api graphql` arguments. */
function readField(args: readonly string[], key: string): string {
  const field = args.find((arg) => arg.startsWith(`${key}=`));
  return field === undefined ? '' : field.slice(key.length + 1);
}

/** Reads the GraphQL query from `gh api graphql` arguments. */
function readQuery(args: readonly string[]): string {
  return readField(args, 'query');
}

/** Wraps `data` in a successful GraphQL response. */
function respond(data: Record<string, unknown>): GhResult {
  return { exitCode: 0, stderr: '', stdout: JSON.stringify({ data }) };
}

// endregion | Helpers
