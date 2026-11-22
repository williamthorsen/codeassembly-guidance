import { isRecord } from '../lib/type-guards.ts';
import type { GhResult, GhRunner } from '../shared/gh.ts';
import { extractReferences } from './extract-references.ts';

/** A repository's visibility as GitHub reports it, or `UNVERIFIED` when the lookup did not return one. */
export type Visibility = 'INTERNAL' | 'PRIVATE' | 'PUBLIC' | 'UNVERIFIED';

/** The repository that the text is written to: a GitHub repository, or a host whose visibility `gh` cannot read. */
export type Target = { kind: 'github'; repo: string } | { kind: 'other' };

/** The verdict on a text and the evidence for it. */
export interface CheckResult {
  references: { repo: string; visibility: Visibility }[];
  refused: string[];
  target: { kind: Target['kind']; repo: string | null; visibility: Visibility | null };
  verdict: 'pass' | 'refuse';
}

/**
 * Decides whether `text` may be written to `target`. A public GitHub target refuses any reference that GitHub does not
 * report as public; a private, internal, or non-GitHub target passes without a lookup of the references. Throws when
 * the target's visibility or the authenticated user cannot be read.
 */
export async function checkPublicReferences(target: Target, text: string, gh: GhRunner): Promise<CheckResult> {
  if (target.kind === 'other') {
    return { references: [], refused: [], target: { kind: 'other', repo: null, visibility: null }, verdict: 'pass' };
  }

  const { login, visibility } = await readTarget(target.repo, gh);
  const summary = { kind: target.kind, repo: target.repo, visibility };
  if (visibility !== 'PUBLIC') {
    return { references: [], refused: [], target: summary, verdict: 'pass' };
  }

  const [owner = ''] = target.repo.split('/', 1);
  const repos = extractReferences(text, new Set([owner, login])).filter((repo) => repo !== target.repo.toLowerCase());
  const references = await readVisibilities(repos, gh);
  const refused = references.filter((reference) => reference.visibility !== 'PUBLIC').map(({ repo }) => repo);
  return { references, refused, target: summary, verdict: refused.length === 0 ? 'pass' : 'refuse' };
}

// region | Helpers

// GitHub caps the nodes of one query; 100 aliases stays within the cap.
const CHUNK_SIZE = 100;

const REPORTED_VISIBILITIES = ['INTERNAL', 'PRIVATE', 'PUBLIC'] as const satisfies readonly Visibility[];

const TARGET_QUERY = `query($owner: String!, $name: String!) {
  viewer { login }
  repository(owner: $owner, name: $name) { visibility }
}`;

/** Splits `items` into consecutive chunks of at most `size`. */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/** Describes a failed `gh` run by its stderr, or by its exit code when stderr is empty. */
function describeFailure(result: GhResult): string {
  const message = result.stderr.trim();
  return message.length > 0 ? message : `gh exited with code ${result.exitCode}`;
}

/** Parses JSON, or returns `undefined` when the text is not JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Reads `data` from a GraphQL response, or `undefined` when the text is not a response with data. */
function readData(stdout: string): Record<string, unknown> | undefined {
  const response = parseJson(stdout);
  return isRecord(response) && isRecord(response['data']) ? response['data'] : undefined;
}

/** Reads the authenticated user's login and the target's visibility. Throws when either cannot be read. */
async function readTarget(repo: string, gh: GhRunner): Promise<{ login: string; visibility: Visibility }> {
  const [owner = '', name = ''] = repo.split('/', 2);
  const result = await gh([
    'api',
    'graphql',
    '-f',
    `query=${TARGET_QUERY}`,
    '-f',
    `owner=${owner}`,
    '-f',
    `name=${name}`,
  ]);
  const data = readData(result.stdout);
  const viewer = data?.['viewer'];
  const login = isRecord(viewer) && typeof viewer['login'] === 'string' ? viewer['login'] : undefined;
  const visibility = readVisibility(data?.['repository']);
  if (login === undefined || visibility === 'UNVERIFIED') {
    throw new Error(`cannot read the visibility of ${repo}: ${describeFailure(result)}`);
  }
  return { login, visibility };
}

/** Reads a `repository { visibility }` node, or `UNVERIFIED` when the node is null or malformed. */
function readVisibility(node: unknown): Visibility {
  const value = isRecord(node) ? node['visibility'] : undefined;
  return REPORTED_VISIBILITIES.find((visibility) => visibility === value) ?? 'UNVERIFIED';
}

/**
 * Looks up the visibility of each repository, one aliased `repository` field per repository. `gh api graphql` exits
 * non-zero when any alias fails, so stdout is read whatever the exit code: A null alias is a repository that GitHub
 * does not show to this account, and stdout that is not a response leaves every repository of its chunk unverified.
 */
async function readVisibilities(
  repos: readonly string[],
  gh: GhRunner,
): Promise<{ repo: string; visibility: Visibility }[]> {
  const references: { repo: string; visibility: Visibility }[] = [];
  for (const repoChunk of chunk(repos, CHUNK_SIZE)) {
    const fields = repoChunk.map((repo, index) => {
      const [owner = '', name = ''] = repo.split('/', 2);
      return `r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { visibility }`;
    });
    const result = await gh(['api', 'graphql', '-f', `query={\n${fields.join('\n')}\n}`]);
    const data = readData(result.stdout);
    for (const [index, repo] of repoChunk.entries()) {
      references.push({ repo, visibility: readVisibility(data?.[`r${index}`]) });
    }
  }
  return references;
}

// endregion | Helpers
