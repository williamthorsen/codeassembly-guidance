import { describe, expect, it } from 'vitest';

import { readContentFile } from '../test-utils/read-content-file.ts';

// `merge-pr` settles every type defect and every disagreement with the work-type test before the merge is offered.
// A step that asks which type to take overrides the `option-format` gate inlined into the same body, so the guard
// has to be on the step's wording.

/**
 * Phrases that a restored type question contains. Lowercased, so that a sentence's opening capital still matches.
 */
const TYPE_ASK_PHRASES: ReadonlyArray<string> = [
  'ask for the type',
  "ask step 6's type question",
  'ask one question per entry defect',
  'raise that as a question here',
];

const EXPANDED = readContentFile('skills/merge-pr/SKILL.md');

describe('merge-pr contract', () => {
  it('decides each type rather than asking the developer', async () => {
    const text = (await EXPANDED).toLowerCase();
    const found = TYPE_ASK_PHRASES.filter((phrase) => text.includes(phrase));

    const message =
      'A type is a determination by the work-type test, which this session applies with the diff in hand. An ask ' +
      `hands the developer a close call with less of the evidence. These phrases are back:\n  ${found.join('\n  ')}`;
    expect(text).toContain('never by asking which to choose');
    expect(found, message).toEqual([]);
  });

  it('asks once to authorize the entry amendments that rewrite the PR body', async () => {
    const text = (await EXPANDED).toLowerCase();

    expect(text).toContain('ask once to authorize all of them');
  });

  it("keeps a type that the developer named over the test's type", async () => {
    const text = (await EXPANDED).toLowerCase();

    expect(text).toContain('a type that the developer named, through `--type` or in an answer at the gate, stands');
  });

  it('merges without asking only when every guardrail of merge.approval: auto holds', async () => {
    const text = await EXPANDED;

    expect(text).toContain('| `--confirm`');
    expect(text).toContain('`merge_approval` is `auto`, and `--confirm` was not passed.');
    expect(text).toContain('`scm` is `"github"`.');
    expect(text).toContain("The report's `notices` is empty.");
    expect(text).toContain('step 5 did not dispatch the drafter');
    expect(text).toContain('`effective_record.breaking` is false.');
    expect(text).toContain('`mergeStateStatus` is `CLEAN` or `HAS_HOOKS`.');
  });

  it('names every side effect in the authorization line that replaces the ask', async () => {
    const text = await EXPANDED;

    expect(text).toContain(
      '`remote` → `Merging PR #{pr_number} and deleting the remote branch {headRefName} without confirmation, as merge.approval: auto authorizes.`',
    );
    expect(text).toContain(
      '`both` → `Merging PR #{pr_number} and deleting the local and remote branch {headRefName} without confirmation, as merge.approval: auto authorizes.`',
    );
  });

  it('shows the gate when the re-read after an unasked merge decision finds a change', async () => {
    const text = await EXPANDED;

    expect(text).toContain('When step 6 merged without asking, the approved values are the ones that it rendered');
  });

  it('invokes nothing after the merge but the offer to close the parent', async () => {
    const text = (await EXPANDED).toLowerCase();

    expect(text).toContain("invoke nothing but step 12's offer to close the parent");
    expect(text).not.toContain('ripple');
  });

  it('offers to close the parent after reporting the outcome and before the closing notes', async () => {
    const text = await EXPANDED;
    const reportIndex = text.indexOf('### 11. Report the outcome');
    const parentIndex = text.indexOf('### 12. Offer to close the parent');
    const importantIndex = text.indexOf('## Important');

    expect(reportIndex).toBeGreaterThan(-1);
    expect(parentIndex).toBeGreaterThan(reportIndex);
    expect(importantIndex).toBeGreaterThan(parentIndex);
    expect(text.slice(parentIndex, importantIndex)).not.toMatch(/^### 13\./m);
  });

  it('reads the parent of the ticket that the merge commit closes rather than the session ticket', async () => {
    const text = await EXPANDED;

    expect(text).toContain(
      'when `effective_record.ticket_ref` from step 3 is null or is not a GitHub `#{N}` reference',
    );
    expect(text).toContain('Take the ticket from that field rather than from session context');
    expect(text).toContain('groom-backlog.mjs parent-status --ticket {N}');
  });

  it('closes the parent only on a clear yes, listing its unmet criteria', async () => {
    const text = await EXPANDED;

    expect(text).toContain('close nothing without a clear yes');
    expect(text).toContain('`parent.uncheckedCriteria`');
    expect(text).toContain('gh issue close {P} --reason completed');
  });
});
