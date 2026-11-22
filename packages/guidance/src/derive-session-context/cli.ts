/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
/**
 * CLI entry for the session-context deriver.
 *
 * The CLI writes every diagnostic to stderr, so stdout contains the JSON manifest alone. When the derivation throws an
 * error, the CLI exits 1.
 *
 * Every invocation composes the manifest from the current preferences and git state. The manifest file keeps only what
 * composition cannot reproduce: `created_at` and the URLs written by the mutation flags, recorded in `explicit_urls`.
 * The file is rewritten only when its content changes.
 *
 * - Diff base: `diff_base` is read from the git config key `branch.<branch>.codeassemblyDiffBase` on every
 *   invocation, and `--set-diff-base` and `--clear-diff-base` write that key. Git config is shared by every worktree
 *   of the repository, so a value written before a branch's worktree exists is visible from it.
 * - Default-branch invariant: A manifest whose branch is the default branch does not store a `ticket_url`, a
 *   `pr_url`, or a `diff_base`. Because the default branch is not derived from any ticket and does not belong to
 *   any pull request or split, a stored value there is wrong rather than stale. See `enforceDefaultBranchInvariant`.
 */
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { isRecord } from '../lib/type-guards.ts';
import { resolveCurrentBranch, sanitizeBranch } from '../shared/branch-helpers.ts';
import { realGit, type SharedGit } from '../shared/git.ts';
import { resolveProjectRoot } from '../shared/resolve-project-root.ts';
import { composeManifest, DEFAULT_REMOTE_NAME } from './compose-manifest.ts';
import { readPriorManifest, writeManifest } from './manifest-file.ts';
import { readPreferences, readProjectPreferences } from './read-preferences.ts';
import { readProjectStage, readSubdirectoryStages } from './read-project-stage.ts';
import { type DiffBaseMutation, resolveDiffBase } from './resolve-diff-base.ts';
import type { BranchManifest, ExplicitUrls } from './types.ts';

/** The manifest fields written by the mutation flags, and the ones that the default-branch invariant governs. */
const STORED_URL_FIELDS = ['ticket_url', 'pr_url'] as const;

type StoredUrlField = (typeof STORED_URL_FIELDS)[number];

/** A request to set or clear one stored URL field. */
interface ManifestMutation {
  readonly field: StoredUrlField;
  readonly value: string | null;
}

interface ParsedArgs {
  readonly branch: string | null;
  readonly cwd: string | null;
  readonly diffBase: DiffBaseMutation | undefined;
  readonly home: string | null;
  readonly mutations: readonly ManifestMutation[];
}

/** Executes the deriver from `process.argv`, writing the JSON manifest to stdout. */
async function main(): Promise<void> {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    const cwd = resolveProjectRoot({ cwd: parsed.cwd });
    const branch = parsed.branch ?? (await resolveCurrentBranch(cwd));

    const manifest = await deriveSessionContext({
      cwd,
      branch,
      now: new Date(),
      mutations: parsed.mutations,
      ...(parsed.diffBase !== undefined && { diffBaseMutation: parsed.diffBase }),
      ...(parsed.home !== null && { home: parsed.home }),
    });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`derive-session-context: ${message}\n`);
    process.exit(1);
  }
}

/**
 * Composes the manifest for `branch` from the current preferences, carrying `created_at` and the flag-written URLs
 * forward from the prior manifest file, applying any mutations, and reading the stored diff base. The default-branch
 * invariant is enforced last.
 *
 * @internal Exported for testing.
 */
export async function deriveSessionContext(input: {
  cwd: string;
  branch: string;
  now: Date;
  git?: SharedGit;
  home?: string;
  mutations?: readonly ManifestMutation[];
  diffBaseMutation?: DiffBaseMutation;
}): Promise<BranchManifest> {
  if (input.branch === '' || input.branch === 'HEAD') {
    throw new Error('Detached HEAD: This script requires an active branch. Create or check out a branch first.');
  }

  const home = input.home ?? homedir();
  const sanitizedBranch = sanitizeBranch(input.branch);
  const newPath = path.join(input.cwd, '.agents', `${sanitizedBranch}.branch-manifest.json`);
  const oldPath = path.join(input.cwd, '.agents', `${sanitizedBranch}.manifest.json`);
  const mutations = input.mutations ?? [];

  const git = input.git ?? realGit;
  const prior = (await readPriorManifest(newPath)) ?? (await readPriorManifest(oldPath));
  const composed = await composeFromPreferences({
    cwd: input.cwd,
    git,
    home,
    branch: input.branch,
    now: input.now,
  });

  const carried = prior?.record === undefined ? {} : readExplicitUrls(prior.record, composed);
  const { seeded, explicitUrls } = enforceDefaultBranchInvariant(
    composed,
    applyMutations(carried, mutations),
    mutations,
  );
  const diffBase = await resolveDiffBase({
    git,
    cwd: input.cwd,
    branchName: composed.branch_name,
    isDefaultBranch: isOnDefaultBranch(composed),
    mutation: input.diffBaseMutation,
  });
  const manifest = buildManifest(seeded, explicitUrls, prior?.record, diffBase);

  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  const priorText = prior?.path === newPath ? prior.text : undefined;
  if (content !== priorText) {
    await writeManifest(newPath, content);
  }
  return manifest;
}

/** Returns a copy of `explicitUrls` with each mutation applied in order. */
function applyMutations(explicitUrls: ExplicitUrls, mutations: readonly ManifestMutation[]): ExplicitUrls {
  let result = explicitUrls;
  for (const mutation of mutations) {
    result = { ...result, [mutation.field]: mutation.value };
  }
  return result;
}

/**
 * Builds the emitted manifest: the composed fields, the prior `created_at` when one is recorded, each stored-URL field
 * taken from `explicitUrls` when a flag wrote it, else from composition, and the branch's diff base.
 */
function buildManifest(
  composed: BranchManifest,
  explicitUrls: ExplicitUrls,
  prior: Record<string, unknown> | undefined,
  diffBase: string | null,
): BranchManifest {
  const createdAt = typeof prior?.['created_at'] === 'string' ? prior['created_at'] : composed.created_at;
  return {
    ...composed,
    created_at: createdAt,
    ticket_url: resolveStoredUrl('ticket_url', composed, explicitUrls),
    pr_url: resolveStoredUrl('pr_url', composed, explicitUrls),
    diff_base: diffBase,
    explicit_urls: explicitUrls,
  };
}

/** Composes a fresh manifest from the preferences files and the git remote. */
async function composeFromPreferences(input: {
  cwd: string;
  git: SharedGit;
  home: string;
  branch: string;
  now: Date;
}): Promise<BranchManifest> {
  const readResult = await readPreferences({ cwd: input.cwd, home: input.home });
  const projectPreferences = await readProjectPreferences(input.cwd);
  const projectStage = readProjectStage(projectPreferences);
  const subdirectoryStages = readSubdirectoryStages(projectPreferences, projectStage);
  const remoteName = readResult.preferences.repository?.default_remote?.name ?? DEFAULT_REMOTE_NAME;
  const remoteUrl = await resolveRemoteUrl(input.git, input.cwd, remoteName);
  return composeManifest({
    preferences: readResult.preferences,
    projectStage,
    subdirectoryStages,
    branchName: input.branch,
    cwd: input.cwd,
    home: input.home,
    now: input.now,
    remoteUrl,
  });
}

/**
 * Enforces the default-branch invariant: On the default branch, `ticket_url` and `pr_url` are null.
 * That branch is not derived from any ticket and does not belong to any pull request, so a value there is
 * not the branch's association but whichever one the last session happened to resolve, and a later session
 * auto-resolving from it would proceed against an arbitrary ticket or PR.
 *
 * On that branch, the composed URLs are nulled and every flag-written URL is dropped. Both a refused `--set-*` and the
 * repair of a value already stored are reported, since a silently vanishing URL is the harder of the two to explain.
 */
function enforceDefaultBranchInvariant(
  composed: BranchManifest,
  explicitUrls: ExplicitUrls,
  mutations: readonly ManifestMutation[],
): { seeded: BranchManifest; explicitUrls: ExplicitUrls } {
  if (!isOnDefaultBranch(composed)) {
    return { seeded: composed, explicitUrls };
  }
  for (const field of STORED_URL_FIELDS) {
    const stored = explicitUrls[field];
    if (stored === undefined || stored === null) {
      continue;
    }
    const refused = mutations.some((mutation) => mutation.field === field && mutation.value !== null);
    process.stderr.write(
      refused
        ? `derive-session-context: refusing to store ${field} on default branch ${composed.branch_name}\n`
        : `derive-session-context: cleared ${field} stored on default branch ${composed.branch_name}\n`,
    );
  }
  return { seeded: { ...composed, ticket_url: null, pr_url: null }, explicitUrls: {} };
}

/**
 * True when the manifest's branch is the repository's default branch. `default_branch` is
 * remote-qualified (`origin/main`) whereas `branch_name` is bare, so the remote is stripped before the
 * comparison. Only the first segment is stripped: A remote name does not contain a slash, and a branch name
 * may contain one (`origin/release/2.x` yields `release/2.x`).
 */
function isOnDefaultBranch(manifest: BranchManifest): boolean {
  const { default_branch: defaultBranch, branch_name: branchName } = manifest;
  const separatorIndex = defaultBranch.indexOf('/');
  const defaultBranchName = separatorIndex === -1 ? defaultBranch : defaultBranch.slice(separatorIndex + 1);
  return defaultBranchName === branchName;
}

/** True when `value` is a string or `null`. */
function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

/**
 * Reads the flag-written URLs from a prior manifest, skipping any entry whose value is not `string | null`. A manifest
 * written before `explicit_urls` existed does not record provenance, so each of its stored URL strings that differs
 * from the fresh composition is taken as flag-written.
 */
function readExplicitUrls(prior: Record<string, unknown>, composed: BranchManifest): ExplicitUrls {
  let result: ExplicitUrls = {};
  if (Object.hasOwn(prior, 'explicit_urls')) {
    const stored = prior['explicit_urls'];
    if (!isRecord(stored)) {
      return result;
    }
    for (const field of STORED_URL_FIELDS) {
      const value = stored[field];
      if (Object.hasOwn(stored, field) && isStringOrNull(value)) {
        result = { ...result, [field]: value };
      }
    }
    return result;
  }
  for (const field of STORED_URL_FIELDS) {
    const value = prior[field];
    if (typeof value === 'string' && value !== composed[field]) {
      result = { ...result, [field]: value };
    }
  }
  return result;
}

/** Returns the flag-written value of `field` when one is recorded, else the composed one. */
function resolveStoredUrl(field: StoredUrlField, composed: BranchManifest, explicitUrls: ExplicitUrls): string | null {
  if (Object.hasOwn(explicitUrls, field)) {
    return explicitUrls[field] ?? null;
  }
  return composed[field] ?? null;
}

/**
 * Resolves the named git remote's fetch URL at `cwd` as git reports it, or null on any failure, which lets a caller
 * treat an unresolvable remote as absent.
 */
async function resolveRemoteUrl(git: SharedGit, cwd: string, remoteName: string): Promise<string | null> {
  try {
    return (await git.findRemoteUrl(cwd, remoteName)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Parses the CLI's argv, throwing on an unknown flag or a missing value.
 *
 * @internal Exported for testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  let branch: string | null = null;
  let cwd: string | null = null;
  let diffBase: DiffBaseMutation | undefined;
  let home: string | null = null;
  const mutations: ManifestMutation[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--branch') {
      branch = consumeValue(argv, i, '--branch');
      i += 1;
    } else if (arg.startsWith('--branch=')) {
      branch = arg.slice('--branch='.length);
    } else if (arg === '--cwd') {
      cwd = consumeValue(argv, i, '--cwd');
      i += 1;
    } else if (arg.startsWith('--cwd=')) {
      cwd = arg.slice('--cwd='.length);
    } else if (arg === '--home') {
      home = consumeValue(argv, i, '--home');
      i += 1;
    } else if (arg.startsWith('--home=')) {
      home = arg.slice('--home='.length);
    } else if (arg === '--set-ticket-url') {
      mutations.push({ field: 'ticket_url', value: consumeValue(argv, i, '--set-ticket-url') });
      i += 1;
    } else if (arg.startsWith('--set-ticket-url=')) {
      mutations.push({ field: 'ticket_url', value: arg.slice('--set-ticket-url='.length) });
    } else if (arg === '--set-pr-url') {
      mutations.push({ field: 'pr_url', value: consumeValue(argv, i, '--set-pr-url') });
      i += 1;
    } else if (arg.startsWith('--set-pr-url=')) {
      mutations.push({ field: 'pr_url', value: arg.slice('--set-pr-url='.length) });
    } else
      switch (arg) {
        case '--clear-ticket-url':
          mutations.push({ field: 'ticket_url', value: null });

          break;
        case '--clear-pr-url':
          mutations.push({ field: 'pr_url', value: null });

          break;
        case '--clear-diff-base':
          diffBase = { value: null };

          break;
        case '--set-diff-base':
          diffBase = { value: consumeValue(argv, i, '--set-diff-base') };
          i += 1;

          break;
        default:
          if (arg.startsWith('--set-diff-base=')) {
            diffBase = { value: arg.slice('--set-diff-base='.length) };
          } else {
            throw new Error(`unknown argument: ${arg}`);
          }
      }
  }
  return { branch, cwd, diffBase, home, mutations };
}

/** Reads the value following a space-delimited flag at `index`. Throws when missing. */
function consumeValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

if (isEntryPoint(import.meta.url, 'derive-session-context')) {
  await main();
}
