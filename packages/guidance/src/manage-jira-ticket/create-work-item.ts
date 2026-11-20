import { isRecord } from '../lib/type-guards.ts';
import { resolveChildIssueType } from './resolve-target.ts';

/** The exit code and output of one `acli` invocation. */
export interface AcliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/** Runs `acli` with the given arguments, without a shell. */
export type RunAcli = (args: readonly string[]) => Promise<AcliResult>;

/**
 * What a create call submits. The description is an ADF file that the caller has already written. `subtaskIssueType`
 * replaces `issueType` under a level-0 parent, and is undefined for an umbrella.
 */
export interface CreateRequest {
  adfPath: string;
  issueType: string;
  parent: string | undefined;
  projectKey: string;
  subtaskIssueType: string | undefined;
  summary: string;
}

/**
 * The fields reported for every run that made the create call. `key` is null when it could not be read, and `issueType`
 * is the type with which the work item was created.
 */
export interface CreateResult {
  issueType: string;
  key: string | null;
  parentSkipped: boolean;
  rawOutput: string;
}

/** A create run's result, and the diagnostics to report on stderr. `ok` is false when the result's key is null. */
export interface CreateOutcome {
  diagnostics: string[];
  ok: boolean;
  result: CreateResult;
}

/**
 * Creates one Jira work item through `acli`. A requested parent is checked first with `acli jira workitem view`, which
 * also reports its hierarchy level, from which the work item's issue type follows. A parent that the check rejects,
 * whose level cannot be read, or that cannot take the work item at that level is dropped and reported as skipped rather
 * than failing the create, which is the only call that can set one.
 *
 * The create command runs exactly once. When it fails, or its output does not yield a top-level `key`, the outcome is
 * not ok and contains the raw output, from which the caller reads the key: A second create would duplicate the item.
 */
export async function createWorkItem(request: CreateRequest, runAcli: RunAcli): Promise<CreateOutcome> {
  const diagnostics: string[] = [];

  let parent = request.parent;
  let issueType = request.issueType;
  if (parent !== undefined) {
    const view = await runAcli(['jira', 'workitem', 'view', parent, '--json', '--fields', 'issuetype']);
    const parentLevel = view.exitCode === 0 ? parseHierarchyLevel(view.stdout) : undefined;
    const placement = parentLevel === undefined ? undefined : resolveChildIssueType(request, parentLevel);
    if (view.exitCode !== 0) {
      diagnostics.push(
        `parent ${parent} rejected by acli (exit ${view.exitCode}); creating without it: ${view.stderr.trim()}`,
      );
      parent = undefined;
    } else if (placement === undefined) {
      diagnostics.push(`could not read the hierarchy level of parent ${parent}; creating without it`);
      parent = undefined;
    } else if (placement.parentAllowed) {
      issueType = placement.issueType;
    } else {
      diagnostics.push(
        `parent ${parent} is at hierarchy level ${String(parentLevel)}, which cannot take a ${issueType}; ` +
          'creating without it',
      );
      parent = undefined;
    }
  }
  const parentSkipped = request.parent !== undefined && parent === undefined;

  const args = [
    'jira',
    'workitem',
    'create',
    '--project',
    request.projectKey,
    '--type',
    issueType,
    '--summary',
    request.summary,
    '--description-file',
    request.adfPath,
    '--json',
  ];
  if (parent !== undefined) {
    args.push('--parent', parent);
  }
  const created = await runAcli(args);

  if (created.exitCode !== 0) {
    diagnostics.push(
      `acli jira workitem create exited ${created.exitCode}; check Jira before creating again: ${created.stderr.trim()}`,
    );
    return { diagnostics, ok: false, result: { issueType, key: null, parentSkipped, rawOutput: created.stdout } };
  }

  const key = parseKey(created.stdout);
  if (key === null) {
    diagnostics.push(
      'could not read a key from the acli create output; read it from rawOutput and do not create again',
    );
  }
  return { diagnostics, ok: key !== null, result: { issueType, key, parentSkipped, rawOutput: created.stdout } };
}

// region | Helpers

/** Reads `fields.issuetype.hierarchyLevel` from `acli`'s JSON view, or undefined when it is not an integer. */
function parseHierarchyLevel(stdout: string): number | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  const fields = isRecord(parsed) ? parsed['fields'] : undefined;
  const issueType = isRecord(fields) ? fields['issuetype'] : undefined;
  const level = isRecord(issueType) ? issueType['hierarchyLevel'] : undefined;
  return typeof level === 'number' && Number.isSafeInteger(level) ? level : undefined;
}

/** Reads the top-level `key` from `acli`'s JSON output, or null when the output is not an object with a string key. */
function parseKey(stdout: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  return isRecord(parsed) && typeof parsed['key'] === 'string' && parsed['key'] !== '' ? parsed['key'] : null;
}

// endregion | Helpers
