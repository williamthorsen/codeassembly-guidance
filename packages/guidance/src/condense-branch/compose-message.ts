/** Composes a condensed commit's message from its body and the change entries of a branch consolidation. */
import { isRecord } from '../lib/type-guards.ts';

/**
 * Returns the body with its trailing whitespace trimmed, followed by a blank line and one `Change:` trailer per entry
 * when there are any, ending with a single newline because `git commit-tree` applies no cleanup.
 */
export function composeMessage(body: string, changes: readonly string[]): string {
  const trimmedBody = body.trimEnd();
  if (changes.length === 0) {
    return `${trimmedBody}\n`;
  }
  const trailers = changes.map((change) => `Change: ${change}`).join('\n');
  return `${trimmedBody}\n\n${trailers}\n`;
}

/**
 * Returns the `change` of each entry of a `consolidate-branch` record, in file order. Blank text means that the
 * consolidation failed and left its file empty, and yields no entries. Throws on text that is not a record with an
 * `entries` array whose every `change` is a non-empty string, so that a corrupt record never silently drops trailers.
 */
export function parseChangeEntries(text: string): string[] {
  if (text.trim() === '') {
    return [];
  }

  let record: unknown;
  try {
    record = JSON.parse(text);
  } catch (error) {
    throw new Error(`consolidation file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const entries = isRecord(record) ? record['entries'] : undefined;
  if (!Array.isArray(entries)) {
    throw new Error('consolidation file does not contain an `entries` array');
  }

  return entries.map((entry: unknown, index) => {
    const change = isRecord(entry) ? entry['change'] : undefined;
    if (typeof change !== 'string' || change.trim() === '') {
      throw new Error(`consolidation entry ${index} does not have a non-empty \`change\` string`);
    }
    return change;
  });
}
