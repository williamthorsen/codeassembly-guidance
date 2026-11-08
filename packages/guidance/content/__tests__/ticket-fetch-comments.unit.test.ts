import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// A ticket's comments are part of its content, so a GitHub fetch that reads the body without them hands the reader an
// incomplete ticket. A fetch of a single other field, such as `labels` or `blockedBy`, does not read the ticket's
// content and passes.
const EXTRACTION_MARKER = '<!-- Extracted verbatim from the superpowers plugin. Do not edit. -->';

// `_partials` holds content that the expander inlines into skills and subagents at install time.
const SCANNED_DIRS: ReadonlyArray<string> = ['_partials', 'skills', 'subagents'];

// Matches within one line, in prose and fences alike, with `--json` before or after the issue argument.
const ISSUE_FETCH = /gh issue (?:view|list)\b[^`\n]*?--json[ =]['"]?([\w,]+)/g;

describe('ticket fetches in content', () => {
  it('request the comments whenever they request the body', async () => {
    const offenders = await findOffenders();

    expect(offenders, `These fetches read the body without the comments:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('flags a body fetch without comments and passes one with them', () => {
    expect(findLineOffenders('gh issue view 1 --json title,body')).toEqual(['title,body']);
    expect(findLineOffenders("gh issue view --json body --jq '.body' {number}")).toEqual(['body']);
    expect(findLineOffenders('gh issue view --json title,body,comments {number}')).toEqual([]);
    expect(findLineOffenders('gh issue view {number} --json labels')).toEqual([]);
  });
});

// region | Helpers

/** Lists each scanned line's offending fetch as `file:line: fields`. */
async function findOffenders(): Promise<ReadonlyArray<string>> {
  const offenders: string[] = [];
  for (const dir of SCANNED_DIRS) {
    const files = await listMarkdownFiles(path.join(CONTENT_ROOT, dir));
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      if (content.includes(EXTRACTION_MARKER)) {
        continue;
      }
      for (const [index, line] of content.split('\n').entries()) {
        for (const fields of findLineOffenders(line)) {
          offenders.push(`${path.relative(CONTENT_ROOT, file)}:${index + 1}: ${fields}`);
        }
      }
    }
  }
  return offenders;
}

/** Returns the field list of each issue fetch on the line that includes `body` without `comments`. */
function findLineOffenders(line: string): ReadonlyArray<string> {
  return line
    .matchAll(ISSUE_FETCH)
    .map((match) => match[1] ?? '')
    .filter((fields) => {
      const names = new Set(fields.split(','));
      return names.has('body') && !names.has('comments');
    })
    .toArray();
}

// endregion | Helpers
