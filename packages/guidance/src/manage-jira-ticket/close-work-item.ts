import { isRecord } from '../lib/type-guards.ts';
import type { AcliResult, RunAcli } from './create-work-item.ts';

/** What a close run does: post the body unless already posted, then transition the work item unless already done. */
export interface CloseRequest {
  doneStatus: string;
  key: string;
  post: PostRequest | undefined;
}

/** A post's ADF file, which the caller has already written, and the plain text of its first block. */
export interface PostRequest {
  adfPath: string;
  firstLine: string;
}

/** What became of one write: made, skipped by its check, not asked for, or not reached because an earlier call failed. */
export type StepOutcome = 'made' | 'not-requested' | 'not-run' | 'skipped';

/** The fields reported for every close run. `status` is the status read before the transition, or null when unread. */
export interface CloseResult {
  error?: string;
  posted: StepOutcome;
  status: { category: string; name: string } | null;
  transitioned: StepOutcome;
}

/** A close run's result. `ok` is false when an `acli` call failed or returned output that could not be read. */
export interface CloseOutcome {
  ok: boolean;
  result: CloseResult;
}

/**
 * Posts a comment on a Jira work item and transitions it to `doneStatus`, deciding each write on its own so that a
 * rerun neither posts twice nor transitions a done item. The post is skipped when a comment already opens with the
 * post's first line, and the transition when the status category is `done`, whatever the status's name.
 *
 * A failed call ends the run at that call; a write is never retried, because a second comment would duplicate the post.
 */
export async function closeWorkItem(request: CloseRequest, runAcli: RunAcli): Promise<CloseOutcome> {
  const result: CloseResult = {
    posted: request.post === undefined ? 'not-requested' : 'not-run',
    status: null,
    transitioned: 'not-run',
  };

  if (request.post !== undefined) {
    const listed = await runAcli(['jira', 'workitem', 'comment', 'list', '--key', request.key, '--paginate', '--json']);
    const bodies = listed.exitCode === 0 ? parseCommentBodies(listed.stdout) : null;
    if (bodies === null) {
      return fail(result, describeFailure('comment list', listed));
    }

    const firstLine = collapseWhitespace(request.post.firstLine);
    if (bodies.some((body) => collapseWhitespace(body).startsWith(firstLine))) {
      result.posted = 'skipped';
    } else {
      const created = await runAcli([
        'jira',
        'workitem',
        'comment',
        'create',
        '--key',
        request.key,
        '--body-file',
        request.post.adfPath,
      ]);
      if (created.exitCode !== 0) {
        return fail(result, `${describeFailure('comment create', created)}; check the work item before posting again`);
      }
      result.posted = 'made';
    }
  }

  const viewed = await runAcli(['jira', 'workitem', 'view', request.key, '--json', '--fields', 'status']);
  const status = viewed.exitCode === 0 ? parseStatus(viewed.stdout) : null;
  if (status === null) {
    return fail(result, describeFailure('view', viewed));
  }
  result.status = status;

  if (status.category === 'done') {
    result.transitioned = 'skipped';
    return { ok: true, result };
  }

  const transitioned = await runAcli([
    'jira',
    'workitem',
    'transition',
    '--key',
    request.key,
    '--status',
    request.doneStatus,
    '--yes',
  ]);
  if (transitioned.exitCode !== 0) {
    return fail(result, describeFailure('transition', transitioned));
  }
  result.transitioned = 'made';
  return { ok: true, result };
}

/**
 * Reads the plain text of an ADF document's first top-level block, whatever its type: its text nodes in order, with
 * hard breaks read as spaces and whitespace collapsed. Returns an empty string when the document does not have one.
 */
export function readFirstLine(adf: unknown): string {
  const content = isRecord(adf) ? adf['content'] : undefined;
  const first: unknown = Array.isArray(content) ? content[0] : undefined;
  return collapseWhitespace(collectText(first));
}

// region | Helpers

const TEXT_BLOCKS: ReadonlySet<string> = new Set(['codeBlock', 'heading', 'paragraph']);

/** Joins the text of `node` and its descendants, separating nested blocks and reading a hard break as a space. */
function collectText(node: unknown): string {
  if (!isRecord(node)) {
    return '';
  }
  if (node['type'] === 'text') {
    return typeof node['text'] === 'string' ? node['text'] : '';
  }
  if (node['type'] === 'hardBreak') {
    return ' ';
  }
  const content = node['content'];
  if (!Array.isArray(content)) {
    return '';
  }
  // A text block holds inline nodes, which join directly; any other node holds blocks, which join with a space.
  const separator = typeof node['type'] === 'string' && TEXT_BLOCKS.has(node['type']) ? '' : ' ';
  return content.map((child) => collectText(child)).join(separator);
}

/** Collapses each whitespace run to one space and trims the ends. */
function collapseWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim();
}

/** States which `acli` call failed, with its exit code and stderr, or that its output could not be read. */
function describeFailure(call: string, outcome: AcliResult): string {
  return outcome.exitCode === 0
    ? `could not read the output of acli jira workitem ${call}`
    : `acli jira workitem ${call} exited ${outcome.exitCode}: ${outcome.stderr.trim()}`;
}

/** Records `error` on `result` and returns the failed outcome. */
function fail(result: CloseResult, error: string): CloseOutcome {
  return { ok: false, result: { ...result, error } };
}

/**
 * Reads each comment's plain-text body from `comment list --paginate --json` output, which prints one JSON object per
 * page, one after another. Returns null when any page has another shape.
 */
function parseCommentBodies(stdout: string): string[] | null {
  const pages = splitJsonObjects(stdout);
  if (pages === null) {
    return null;
  }
  const bodies: string[] = [];
  for (const page of pages) {
    const parsed = parseJson(page);
    const comments = isRecord(parsed) ? parsed['comments'] : undefined;
    if (!Array.isArray(comments)) {
      return null;
    }
    for (const comment of comments) {
      bodies.push(isRecord(comment) && typeof comment['body'] === 'string' ? comment['body'] : '');
    }
  }
  return bodies;
}

/** Parses `text` as JSON, returning undefined when it is not valid JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Reads the status name and status-category key from `view --json --fields status` output, or null when absent. */
function parseStatus(stdout: string): CloseResult['status'] {
  const parsed = parseJson(stdout);
  const fields = isRecord(parsed) ? parsed['fields'] : undefined;
  const status = isRecord(fields) ? fields['status'] : undefined;
  const category = isRecord(status) ? status['statusCategory'] : undefined;
  if (!isRecord(status) || typeof status['name'] !== 'string' || !isRecord(category)) {
    return null;
  }
  return typeof category['key'] === 'string' ? { category: category['key'], name: status['name'] } : null;
}

/**
 * Splits concatenated top-level JSON objects into their source texts, tracking strings so that a brace inside one does
 * not count. Returns null when the text contains anything other than whitespace between objects, or none at all.
 */
function splitJsonObjects(text: string): string[] | null {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    if (escaped) {
      escaped = false;
      continue;
    }
    const char = text.charAt(index);
    if (inString) {
      escaped = char === '\\';
      inString = char !== '"';
      continue;
    }
    switch (char) {
      case '"':
        inString = true;
        break;
      case '{':
        if (depth === 0) {
          start = index;
        }
        depth += 1;
        break;
      case '}':
        depth -= 1;
        if (depth === 0) {
          objects.push(text.slice(start, index + 1));
        }
        break;
      default:
        if (depth === 0 && !/\s/.test(char)) {
          return null;
        }
    }
  }
  return depth === 0 && !inString && objects.length > 0 ? objects : null;
}

// endregion | Helpers
