import { describe, expect, it } from 'vitest';

import { readContentFile } from '../test-utils/read-content-file.ts';

// A developer who approves the closing post expects the spike to be done. The guard is on the wording, because the
// agent does only what the offer names.

const CONVENTIONS = readContentFile('skills/_data/spike-conventions.md');

describe('closing post contract', () => {
  it('closes the ticket on the same consent that posts the conclusion', async () => {
    const text = await CONVENTIONS;

    expect(text).toContain('then closes the ticket as completed');
    expect(text).toContain("Consent to the offer is the developer's call on closing the ticket");
    expect(text).toContain('When the developer declines, post nothing and leave the ticket open');
  });

  it('decides each write on its own, so that a rerun neither reposts nor fails on a closed ticket', async () => {
    const text = await CONVENTIONS;

    expect(text).toContain("unless a comment already opens with the post's first line");
    expect(text).toContain('`gh issue close {number} --reason completed` only while its state is `OPEN`');
  });

  it('keeps the triage ticket open only when the developer declines', async () => {
    const text = await readContentFile('skills/triage-spike-findings/SKILL.md');

    expect(text).not.toContain('The triage ticket stays open after this run');
    expect(text).not.toContain("The triage ticket stays open: Closing it is the developer's call");
    expect(text).toContain('When the developer declines the offer, the triage ticket stays open');
  });

  it('closes a follow-up triage ticket without a post once its dispositions comment is posted', async () => {
    const skill = await readContentFile('skills/triage-spike-findings/SKILL.md');

    expect(skill).toContain('the close of the triage ticket as completed. Confirm once');
    expect(skill).toContain('On a run given **The batch**, close the triage ticket without a closing post');
    expect(skill).toContain('`gh issue close {triage ticket} --reason completed` only while the state is `OPEN`');
    expect(await CONVENTIONS).toContain('`triage-spike-findings` closes it as completed, without a post');
  });
});

describe.each([
  ['assess-code-health', 'offer to close the ticket with the closing post'],
  ['assess-usability', 'offer to close the ticket with the closing post'],
  ['investigate-spike', 'offer to close it with the closing post'],
  ['triage-spike-findings', 'offer to close the triage ticket with the [closing post]'],
])('%s closing offer', (skill, offer) => {
  it('names the close in the offer', async () => {
    const text = await readContentFile(`skills/${skill}/SKILL.md`);

    expect(text).toContain(offer);
  });
});
