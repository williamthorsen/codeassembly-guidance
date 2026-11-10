import { describe, expect, it } from 'vitest';

import { readContentFile } from '../test-utils/read-content-file.ts';

// `summarize-change` states the reader test for a pull-request description and defines `## Notes for reviewers` as the
// place for a fact that a reviewer acts on. A rule elsewhere that sends a fact to "the pull-request description"
// without the test admits it unfiltered: Two divergence sentences did, and the agent that followed them wrote a
// "Departure from the ticket's proposal" section for a reviewer who had not read the ticket.

/**
 * The files that state where a divergence from the ticket's proposal goes, each with the unconditional form that it
 * had. The shared `AGENTS.md` is read through the Claude harness guidance, which inlines it.
 */
const DIVERGENCE_RULES: ReadonlyArray<{ path: string; unconditional: string }> = [
  {
    path: 'guidance/_harnesses/claude/CLAUDE.md',
    unconditional:
      'and the implementation in the pull-request description, whose job is to describe the change under review',
  },
  {
    path: 'skills/align-ticket-with-implementation/SKILL.md',
    unconditional:
      'report that divergence in the pull-request description, whose job is to describe the change under review',
  },
];

/** The condition under which a divergence enters the description. Lowercased, like the text it is matched against. */
const DIVERGENCE_CONDITION = 'only when it changes what a reviewer checks';

/** The section that receives a fact for a reviewer. Lowercased, like the text it is matched against. */
const NOTES_SECTION = '`## notes for reviewers`';

describe('pull-request description routing', () => {
  it.each(DIVERGENCE_RULES)('admits a divergence only when it changes what a reviewer checks: $path', async (rule) => {
    const text = (await readContentFile(rule.path)).toLowerCase();

    const message =
      'A divergence from the ticket matters to a reviewer only when it changes what they check; sent to the ' +
      'description unconditionally, it becomes a comparison with a ticket that the reviewer has not read.';
    expect(text, message).not.toContain(rule.unconditional);
    expect(text, message).toContain(DIVERGENCE_CONDITION);
    expect(text, message).toContain(NOTES_SECTION);
  });

  it('publishes the summary’s notes and no section of its own', async () => {
    const text = (await readContentFile('skills/create-pr/SKILL.md')).toLowerCase();

    const message =
      'The body that `create-pr` publishes is the summary’s sections, which the reader test filters. A section added ' +
      'at publication escapes the test, which is how a departure-from-the-ticket section reaches the reviewer.';
    expect(text, message).toContain(NOTES_SECTION);
    expect(text, message).toContain('never add a section');
  });
});
