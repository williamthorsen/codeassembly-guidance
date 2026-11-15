/** Condenses the checked-out branch into one commit on its merge base, without touching the index or working tree. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { isMissingFile, isRecord } from '../lib/type-guards.ts';
import { composeMessage, parseChangeEntries } from './compose-message.ts';

/** Inputs to a condensation. */
export interface CondenseOptions {
  /** The revision against which the merge base is computed, such as `origin/main`. */
  base: string;
  /** The consolidation record's path; an absent or empty file yields no trailers. */
  consolidationFile: string | undefined;
  cwd: string;
  /** The path of the file that contains the title, a blank line, and the body. */
  messageFile: string;
}

/** The refs that a condensation created or moved. */
export interface CondenseResult {
  backup: string;
  branch: string;
  condensedHead: string;
  mergeBase: string;
  originalHead: string;
  trailers: number;
}

/**
 * Creates a backup branch at the original head, writes one commit whose tree is the original head's tree and whose
 * parent is the merge base with `base`, and moves the branch to it. Throws before any write on a detached HEAD, a
 * missing or empty message file, a corrupt consolidation record, an ambiguous merge base, or a branch without commits
 * of its own. Throws after deleting the backup when the branch moved during the run.
 */
export function condenseBranch(options: CondenseOptions): CondenseResult {
  const { base, consolidationFile, cwd, messageFile } = options;

  const branch = readCheckedOutBranch(cwd);
  const body = readMessageBody(messageFile);
  const changes = parseChangeEntries(consolidationFile === undefined ? '' : readOptionalFile(consolidationFile));
  const originalHead = readGit(cwd, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const mergeBase = resolveMergeBase(cwd, base, originalHead);
  if (mergeBase === originalHead) {
    throw new Error(`${branch} does not have any commits beyond its merge base with ${base}`);
  }

  const message = composeMessage(body, changes);
  const backup = createBackupBranch(cwd, branch, originalHead);
  const condensedHead = readGit(
    cwd,
    ['commit-tree', `${originalHead}^{tree}`, '-p', mergeBase, '--no-gpg-sign'],
    message,
  );

  try {
    // Pass the original head as the expected value, so that a branch moved during the run fails the update.
    readGit(cwd, ['update-ref', '-m', 'condense-branch', `refs/heads/${branch}`, condensedHead, originalHead]);
  } catch (error) {
    readGit(cwd, ['update-ref', '-d', `refs/heads/${backup}`, originalHead]);
    throw error;
  }

  return { backup, branch, condensedHead, mergeBase, originalHead, trailers: changes.length };
}

// region | Helpers

/** Creates `{branch}-v{N}` at `head` for the lowest free `N`, and returns its name. Never moves an existing branch. */
function createBackupBranch(cwd: string, branch: string, head: string): string {
  for (let version = 1; ; version += 1) {
    const name = `${branch}-v${version}`;
    if (!hasBranch(cwd, name)) {
      readGit(cwd, ['branch', '--no-track', name, head]);
      return name;
    }
  }
}

/** Extracts git's own message from a failed `execFileSync` call, falling back to the thrown error's own text. */
function describeGitFailure(error: unknown): string {
  const stderr = isRecord(error) ? error['stderr'] : undefined;
  if (typeof stderr === 'string' && stderr.trim() !== '') {
    return stderr.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

/** Returns true when a local branch named `name` exists. */
function hasBranch(cwd: string, name: string): boolean {
  try {
    readGit(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]);
    return true;
  } catch {
    return false;
  }
}

/** Returns the checked-out branch's short name. Throws on a detached HEAD. */
function readCheckedOutBranch(cwd: string): string {
  try {
    return readGit(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  } catch {
    throw new Error('HEAD is detached; check out the branch to condense');
  }
}

/** Runs git in `cwd`, feeding `input` to its stdin, and returns its trimmed stdout. Throws with git's own message. */
function readGit(cwd: string, args: readonly string[], input?: string): string {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw new Error(`git ${args[0] ?? ''} failed: ${describeGitFailure(error)}`);
  }
}

/** Returns the message file's content. Throws when the file is missing or blank. */
function readMessageBody(messageFile: string): string {
  let body: string;
  try {
    body = readFileSync(messageFile, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      throw new Error(`message file is missing: ${messageFile}`);
    }
    throw error;
  }
  if (body.trim() === '') {
    throw new Error(`message file is empty: ${messageFile}`);
  }
  return body;
}

/** Returns the file's content, or an empty string when the file does not exist. */
function readOptionalFile(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return '';
    }
    throw error;
  }
}

/** Returns the single merge base of `base` and `head`. Throws when there is none or more than one. */
function resolveMergeBase(cwd: string, base: string, head: string): string {
  const output = readGit(cwd, ['merge-base', '--all', base, head]);
  const bases = output === '' ? [] : output.split('\n');
  if (bases.length === 0) {
    throw new Error(`HEAD does not have a merge base with ${base}`);
  }
  if (bases.length > 1) {
    throw new Error(`HEAD has ${bases.length} merge bases with ${base}, so the condensed commit's parent is ambiguous`);
  }
  return bases[0] ?? '';
}

// endregion | Helpers
