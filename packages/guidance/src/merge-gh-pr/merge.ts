// Merges a GitHub pull request through `gh`, confirms the merge, deletes the head branch on request, and summarizes
// the outcome.
//
// Every `gh` call goes through the injected runner as an argument array, so a shell never interprets a title or path.

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isRecord } from '../lib/type-guards.ts';
import type { DeletionStrategy, MergeStrategy } from '../shared/merge-options.ts';

/** How the head branch deletion ended. */
export type BranchDeletion = 'already-deleted' | 'by-gh' | 'deleted' | 'failed' | 'not-requested';

/** What one `gh` invocation reported. */
export interface GhResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/** A merge that did not complete; `stderr` is written verbatim and the process exits with `exitCode`. */
export interface MergeFailure {
  ok: false;
  exitCode: number;
  stderr: string;
  /** The outcome lines that the agent prints verbatim as the end of its reply. */
  summary: string;
}

export type MergeOutcome = MergeFailure | MergeSuccess;

export interface MergeRequest {
  /** Absolute path to the merge-commit body; read by `gh` for `squash` and `merge`, and ignored for `rebase`. */
  bodyPath: string | undefined;
  deletionStrategy: DeletionStrategy;
  prNumber: number;
  strategy: MergeStrategy;
  /** Merge-commit subject; used for `squash`, and ignored otherwise. */
  title: string | undefined;
}

/** The result printed on stdout. */
export interface MergeResult {
  branchDeletion: BranchDeletion;
  headRefName: string;
  mergeCommit: { oid: string };
  mergedAt: string;
  /** The outcome lines that the agent prints verbatim as the end of its reply. */
  summary: string;
  url: string;
}

export interface MergeSuccess {
  ok: true;
  result: MergeResult;
  /** Lines to write to stderr; the merge still succeeded. */
  warnings: string[];
}

export type RunGh = (args: readonly string[]) => Promise<GhResult>;

const VIEW_FIELDS = 'state,mergeCommit,url,mergedAt,baseRefName,headRefName,headRepository,headRepositoryOwner';

/** Returns the summary of a merge that did not take place, naming the PR when a reference to it is known. */
export function formatRefusalSummary(prRef: string | undefined, reason: string): string {
  const prLines = prRef === undefined ? [] : [`PR: ${prRef}`];
  return formatSummary('## ❌ Not merged', [...prLines, `Reason: ${normalizeBlock(reason)}`]);
}

/**
 * Merges the pull request, confirms that it is `MERGED`, and, for the `remote` deletion strategy, deletes its head ref
 * on the head repository. A deletion failure is a warning, never a merge failure.
 */
export async function mergePullRequest(request: MergeRequest, runGh: RunGh): Promise<MergeOutcome> {
  const merge = await runGh(buildMergeArgs(request));
  if (merge.exitCode !== 0) {
    const reason = merge.stderr.trim() || `\`gh pr merge\` exited with code ${merge.exitCode}.`;
    return {
      ok: false,
      exitCode: merge.exitCode,
      stderr: merge.stderr,
      summary: formatRefusalSummary(`#${request.prNumber}`, reason),
    };
  }

  const view = await runGhAfterMerge(runGh, ['pr', 'view', String(request.prNumber), '--json', VIEW_FIELDS]);
  if (view.exitCode !== 0) {
    return {
      ok: false,
      exitCode: view.exitCode,
      stderr: `PR #${request.prNumber} merge ran, but its state could not be read; branch not deleted.\n${view.stderr}`,
      summary: formatUnconfirmedSummary(request.prNumber, view.stderr),
    };
  }
  const merged = parseMergedView(view.stdout);
  if (merged.kind === 'unreadable') {
    return {
      ok: false,
      exitCode: 1,
      stderr: `PR #${request.prNumber} merge ran, but its state could not be read; branch not deleted.\n`,
      summary: formatUnconfirmedSummary(request.prNumber, ''),
    };
  }
  if (merged.kind === 'not-merged') {
    const reason =
      `PR #${request.prNumber} is ${merged.state} after the merge command, so a merge queue may hold it. ` +
      'The branch was not deleted.';
    return {
      ok: false,
      exitCode: 1,
      stderr: `PR #${request.prNumber} is ${merged.state} after merge; branch not deleted.\n`,
      summary: formatRefusalSummary(merged.url ?? `#${request.prNumber}`, reason),
    };
  }

  const warnings: string[] = [];
  const deletion = await deleteHeadBranch(request.deletionStrategy, merged, runGh, warnings);
  const commitTitle = await readCommitTitle(request, merged.oid, runGh, warnings);

  return {
    ok: true,
    result: {
      branchDeletion: deletion.branchDeletion,
      headRefName: merged.headRefName,
      mergeCommit: { oid: merged.oid },
      mergedAt: merged.mergedAt,
      summary: formatMergedSummary(request, merged, deletion, commitTitle),
      url: merged.url,
    },
    warnings,
  };
}

// region | Helpers

/** How the head branch deletion ended, with the `gh` diagnostic when it failed. */
interface DeletionReport {
  branchDeletion: BranchDeletion;
  reason?: string;
}

interface MergedView {
  kind: 'merged';
  baseRefName: string | undefined;
  headOwner: string | undefined;
  headRefName: string;
  headRepo: string | undefined;
  mergedAt: string;
  oid: string;
  url: string;
}

type ParsedView = MergedView | { kind: 'not-merged'; state: string; url: string | undefined } | { kind: 'unreadable' };

/** The base repository's commits endpoint; `gh api` fills in the placeholders. */
const COMMITS_ENDPOINT = 'repos/{owner}/{repo}/commits';

/** GitHub's name for the result of each strategy. */
const STRATEGY_NAMES: Record<MergeStrategy, string> = {
  merge: 'merge commit',
  rebase: 'rebase',
  squash: 'squash',
};

/** Returns the `gh pr merge` argument array for the request. */
function buildMergeArgs(request: MergeRequest): string[] {
  const args = ['pr', 'merge', String(request.prNumber), `--${request.strategy}`];
  if (request.strategy === 'squash' && request.title !== undefined) {
    args.push('--subject', request.title);
  }
  if (request.strategy !== 'rebase' && request.bodyPath !== undefined) {
    args.push('--body-file', request.bodyPath);
  }
  if (request.deletionStrategy === 'both') {
    args.push('--delete-branch');
  }
  return args;
}

/** Deletes the head ref when the strategy is `remote` and reports how the deletion ended. */
async function deleteHeadBranch(
  deletionStrategy: DeletionStrategy,
  merged: MergedView,
  runGh: RunGh,
  warnings: string[],
): Promise<DeletionReport> {
  if (deletionStrategy === 'none') {
    return { branchDeletion: 'not-requested' };
  }
  if (deletionStrategy === 'both') {
    return { branchDeletion: 'by-gh' };
  }
  // A deleted fork's ref no longer exists in any repository.
  if (merged.headOwner === undefined || merged.headRepo === undefined) {
    return { branchDeletion: 'already-deleted' };
  }

  const refPath = merged.headRefName.split('/').map(encodeURIComponent).join('/');
  const endpoint = `repos/${encodeURIComponent(merged.headOwner)}/${encodeURIComponent(merged.headRepo)}/git/refs/heads/${refPath}`;
  const deletion = await runGhAfterMerge(runGh, ['api', '-X', 'DELETE', endpoint]);
  if (deletion.exitCode === 0) {
    return { branchDeletion: 'deleted' };
  }
  if (deletion.stderr.includes('HTTP 422') && deletion.stderr.includes('Reference does not exist')) {
    return { branchDeletion: 'already-deleted' };
  }
  const reason = deletion.stderr.trim();
  warnings.push(`warning: Failed to delete remote branch '${merged.headRefName}': ${reason}`);
  return { branchDeletion: 'failed', reason };
}

/** Returns the labelled line that reports how the head branch deletion ended. */
function formatDeletionLine(branch: string, deletion: DeletionReport): string {
  const label = deletion.branchDeletion === 'by-gh' ? `Local and remote branch ${branch}` : `Remote branch ${branch}`;
  return `${label}: ${formatDeletionState(deletion)}`;
}

/** Returns the state that the deletion line reports. */
function formatDeletionState(deletion: DeletionReport): string {
  switch (deletion.branchDeletion) {
    case 'already-deleted':
      return '🗑️ Already deleted';
    case 'by-gh':
    case 'deleted':
      return '🗑️ Deleted';
    case 'failed':
      return `⚠️ Not deleted: ${normalizeBlock(deletion.reason ?? 'unknown error')}`;
    case 'not-requested':
      return '⏸️ Kept';
  }
}

/** Returns the summary of a confirmed merge. */
function formatMergedSummary(
  request: MergeRequest,
  merged: MergedView,
  deletion: DeletionReport,
  commitTitle: string,
): string {
  const target = merged.baseRefName === undefined ? '' : ` into ${merged.baseRefName}`;
  const titleLabel = request.strategy === 'rebase' ? 'Last commit title' : 'Commit title';
  return formatSummary(`## 🔀 Merged${target} · ${STRATEGY_NAMES[request.strategy]} · ${merged.oid.slice(0, 7)}`, [
    `${titleLabel}: ${commitTitle}`,
    `PR: ${merged.url}`,
    formatDeletionLine(merged.headRefName, deletion),
  ]);
}

/**
 * Joins a rule, the heading, and the labelled lines. The blank line below the rule keeps `---` from turning the line
 * above it into a setext heading.
 */
function formatSummary(heading: string, lines: readonly string[]): string {
  return ['---', '', heading, '', ...lines].join('\n');
}

/** Returns the summary of a merge whose outcome could not be read after `gh` accepted it. */
function formatUnconfirmedSummary(prNumber: number, stderr: string): string {
  const reason = "The merge command succeeded, but the PR's state could not be read. The branch was not deleted.";
  const diagnostic = stderr.trim();
  return formatSummary('## ⚠️ Merge not confirmed', [
    `PR: #${prNumber}`,
    `Reason: ${diagnostic.length > 0 ? `${reason}\n${normalizeBlock(diagnostic)}` : reason}`,
  ]);
}

/** Trims the text and removes its blank lines, so that it stays inside the summary's block of lines. */
function normalizeBlock(text: string): string {
  return text.trim().replaceAll(/\n(?:[\t ]*\n)+/g, '\n');
}

/** Parses the post-merge `gh pr view` JSON into the fields that confirm the merge and locate the head ref. */
function parseMergedView(stdout: string): ParsedView {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { kind: 'unreadable' };
  }
  if (!isRecord(parsed) || typeof parsed['state'] !== 'string') {
    return { kind: 'unreadable' };
  }
  if (parsed['state'] !== 'MERGED') {
    return { kind: 'not-merged', state: parsed['state'], url: readNonEmptyString(parsed['url']) };
  }
  const { headRefName, mergeCommit, mergedAt, url } = parsed;
  const oid = isRecord(mergeCommit) ? mergeCommit['oid'] : undefined;
  if (
    typeof headRefName !== 'string' ||
    typeof mergedAt !== 'string' ||
    typeof oid !== 'string' ||
    typeof url !== 'string'
  ) {
    return { kind: 'unreadable' };
  }
  return {
    kind: 'merged',
    baseRefName: readNonEmptyString(parsed['baseRefName']),
    headOwner: readNamedField(parsed['headRepositoryOwner'], 'login'),
    headRefName,
    headRepo: readNamedField(parsed['headRepository'], 'name'),
    mergedAt,
    oid,
    url,
  };
}

/**
 * Returns the subject of the commit that the merge created, read from the base repository, which `gh` resolves for
 * `{owner}/{repo}` as it does for `gh pr view`. Falls back to the submitted title, or `unavailable` when none was
 * submitted, and adds a warning when the subject cannot be read.
 */
async function readCommitTitle(request: MergeRequest, oid: string, runGh: RunGh, warnings: string[]): Promise<string> {
  const read = await runGhAfterMerge(runGh, ['api', `${COMMITS_ENDPOINT}/${oid}`, '--jq', '.commit.message']);
  const subject = read.exitCode === 0 ? (read.stdout.trim().split('\n', 1)[0] ?? '').trim() : '';
  if (subject.length > 0) {
    return subject;
  }
  const reason =
    read.exitCode === 0
      ? 'empty commit message'
      : read.stderr.trim() || `\`gh api\` exited with code ${read.exitCode}.`;
  warnings.push(`warning: Could not read the subject of merge commit ${oid}: ${reason}`);
  return request.title ?? 'unavailable';
}

/** Returns the `login` or `name` string of a `gh` repository or owner object, or `undefined` when it is absent. */
function readNamedField(value: unknown, key: 'login' | 'name'): string | undefined {
  return isRecord(value) ? readNonEmptyString(value[key]) : undefined;
}

/** Returns the value when it is a non-empty string, or `undefined` otherwise. */
function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Runs `gh` and returns a thrown error as a failed result, so that a failure after the merge is reported against the
 * step that failed rather than as a merge that did not take place.
 */
async function runGhAfterMerge(runGh: RunGh, args: readonly string[]): Promise<GhResult> {
  try {
    return await runGh(args);
  } catch (error) {
    return { exitCode: 1, stderr: `${describeError(error)}\n`, stdout: '' };
  }
}

// endregion | Helpers
