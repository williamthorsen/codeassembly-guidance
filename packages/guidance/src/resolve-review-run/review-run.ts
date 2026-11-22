import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { isEnoent } from '../lib/type-guards.ts';

/** The mode of every run directory that a skill creates; a run of any other mode is never active. */
const INTERACTIVE_MODE = 'interactive';

/**
 * Matches the heading of an actionable finding in the per-finding template that `review-branch` writes, such as
 * `#### F1: {title}`. A legacy finding's `-L` suffix does not match, because the finding scheme excludes it from action.
 */
export const ACTIONABLE_FINDING_HEADING = /^#### [FWTRS]\d+:/gm;

/** A review that `findLatestReview` selected, with the run directory that contains it. */
export interface LatestReview {
  reviewPath: string;
  runDir: string;
}

// The capture group is the UTC `YYYYMMDD-HHMMSSZ` timestamp; its fixed width makes string order chronological.
const ACTIVE_RUN_DIR_PATTERN = new RegExp(String.raw`^(\d{8}-\d{6}Z)-${INTERACTIVE_MODE}$`);
const REVIEW_FILE_PATTERN = /^(\d{8}-\d{6}Z)_(?:overseer|reviewer)_review\.md$/;
const RESPONSE_FILE_PATTERN = /^(\d{8}-\d{6}Z)_coder_change-summary\.md$/;
const TIMESTAMP_PATTERN = /^\d{8}-\d{6}Z$/;

/** Returns the ticket's active run: its newest `interactive` run directory, or `undefined` when it does not contain one. */
export async function findActiveRun(ticketDir: string): Promise<string | undefined> {
  const runDirName = selectNewest(await listEntryNames(ticketDir, 'directory'), ACTIVE_RUN_DIR_PATTERN);
  return runDirName === undefined ? undefined : path.join(ticketDir, runDirName);
}

/**
 * Finds the newest reviewer or overseer review in the ticket's active run, by the timestamp in its name. Throws when
 * the ticket directory does not contain an active run, or the active run does not contain a review.
 */
export async function findLatestReview(ticketDir: string): Promise<LatestReview> {
  const runDir = await findActiveRun(ticketDir);
  if (runDir === undefined) {
    throw new Error(`${ticketDir} does not contain an ${INTERACTIVE_MODE} run directory`);
  }
  const reviewName = selectNewest(await listEntryNames(runDir, 'file'), REVIEW_FILE_PATTERN);
  if (reviewName === undefined) {
    throw new Error(`${runDir} does not contain a reviewer or overseer review`);
  }
  return { reviewPath: path.join(runDir, reviewName), runDir };
}

/**
 * Returns the ticket's active run, or creates the `{timestamp}-interactive` run directory, with any missing parents,
 * when the ticket directory does not contain one.
 */
export async function openRun(ticketDir: string, timestamp: string): Promise<string> {
  if (!TIMESTAMP_PATTERN.test(timestamp)) {
    throw new Error(`timestamp must be UTC YYYYMMDD-HHMMSSZ, got '${timestamp}'`);
  }
  const activeRun = await findActiveRun(ticketDir);
  if (activeRun !== undefined) {
    return activeRun;
  }
  const runDir = path.join(ticketDir, `${timestamp}-${INTERACTIVE_MODE}`);
  await mkdir(runDir, { recursive: true });
  return runDir;
}

/** The state of a ticket's active run that `readRunState` reports. */
export interface RunState {
  runDir: string | null;
  /** True when the run contains any review. */
  hasReview: boolean;
  newestPath: string | null;
  newestKind: 'response' | 'review' | null;
  /** The actionable findings in the newest artifact when it is a review, else null. */
  findings: number | null;
}

/**
 * Reports the newest review or change summary in the ticket's active run. A change summary counts as newer than a review
 * with the same timestamp, because it answers that review.
 */
export async function readRunState(ticketDir: string): Promise<RunState> {
  const runDir = await findActiveRun(ticketDir);
  if (runDir === undefined) {
    return { runDir: null, hasReview: false, newestPath: null, newestKind: null, findings: null };
  }
  const names = await listEntryNames(runDir, 'file');
  const review = selectNewest(names, REVIEW_FILE_PATTERN);
  const response = selectNewest(names, RESPONSE_FILE_PATTERN);
  if (response !== undefined && (review === undefined || readTimestamp(response) >= readTimestamp(review))) {
    const newestPath = path.join(runDir, response);
    return { runDir, hasReview: review !== undefined, newestPath, newestKind: 'response', findings: null };
  }
  if (review === undefined) {
    return { runDir, hasReview: false, newestPath: null, newestKind: null, findings: null };
  }
  const reviewPath = path.join(runDir, review);
  const content = await readFile(reviewPath, 'utf8');
  const findings = content.match(ACTIONABLE_FINDING_HEADING)?.length ?? 0;
  return { runDir, hasReview: true, newestPath: reviewPath, newestKind: 'review', findings };
}

// region | Helpers

/** Lists the names of the directory's entries of one kind; a missing directory has none. */
async function listEntryNames(dir: string, kind: 'directory' | 'file'): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => (kind === 'directory' ? entry.isDirectory() : entry.isFile()))
      .map((entry) => entry.name);
  } catch (error) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }
}

/** Returns the `YYYYMMDD-HHMMSSZ` timestamp that leads a run artifact's name. */
function readTimestamp(name: string): string {
  return name.slice(0, 'YYYYMMDD-HHMMSSZ'.length);
}

/**
 * Returns the name with the greatest timestamp captured by `pattern`, skipping names that do not match. A tie on the
 * timestamp is broken by the whole name, so that the selection does not depend on directory-listing order.
 */
function selectNewest(names: readonly string[], pattern: RegExp): string | undefined {
  let newest: { name: string; timestamp: string } | undefined;
  for (const name of names) {
    const timestamp = pattern.exec(name)?.[1];
    if (timestamp === undefined) {
      continue;
    }
    if (
      newest === undefined ||
      timestamp > newest.timestamp ||
      (timestamp === newest.timestamp && name > newest.name)
    ) {
      newest = { name, timestamp };
    }
  }
  return newest?.name;
}

// endregion | Helpers
