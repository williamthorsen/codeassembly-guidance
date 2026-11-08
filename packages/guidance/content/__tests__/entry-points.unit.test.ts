import { describe, expect, it } from 'vitest';

import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { readContentFile } from '../test-utils/read-content-file.ts';

// The entry-point rule is stated once, in a data file that `start-ticket` applies when a session starts. The plan
// skills' split reports name `start-ticket` instead of choosing a skill, so a copy of the route list that reappears
// in one of them drifts from the data file without anything reporting it.

const ENTRY_POINTS = 'skills/_data/entry-points.md';

/** Each route's skill, with the phrase that states the condition that selects it. */
const ROUTES: ReadonlyArray<{ readonly skill: string; readonly condition: string }> = [
  { skill: 'design-and-plan', condition: 'A `refinement-log` artifact' },
  { skill: 'implement-plan', condition: 'Any other plan' },
  { skill: 'investigate-spike', condition: 'The newest plan is a spike plan' },
  { skill: 'plan', condition: 'The ticket is ready' },
  { skill: 'prepare-prototype-brief', condition: 'decide the ideas (step 7)' },
  { skill: 'refine-plan', condition: 'inside its `## Decisions taken` section whose text starts with 🔲' },
  { skill: 'refine-prototype', condition: 'does not contain an `open` row' },
  { skill: 'triage-spike-findings', condition: 'proposes work' },
];

/** The skills whose split report includes the launch prompts of a plan-time split. */
const PLAN_SPLIT_CONSUMERS: ReadonlyArray<string> = ['design-and-plan', 'plan', 'refine-plan', 'save-plan'];

/** The opening of the route list that the split report stated before the rule moved to the data file. */
const RETIRED_ROUTE_LIST = "Choose each ticket's entry point";

describe('entry points', () => {
  it.each(ROUTES)('routes to $skill', async ({ skill, condition }) => {
    const content = await readContentFile(ENTRY_POINTS);
    expect(content).toContain(condition);
    expect(content).toContain(skill);
  });

  it('stops on a closed ticket or a merged pull request', async () => {
    const content = await readContentFile(ENTRY_POINTS);
    expect(content).toContain('The ticket is closed, or the branch has a pull request that is open or merged');
  });

  it('passes the spike signal on to the feature routes', async () => {
    const content = await readContentFile(ENTRY_POINTS);
    expect(content).toContain('with `as a spike` after the ticket ref');
  });

  it('applies the data file from start-ticket and asks for a ref that the branch does not encode', async () => {
    const content = await readContentFile('skills/start-ticket/SKILL.md');
    expect(content).toContain('entry-points.md');
    expect(content).toContain('say that the branch does not encode a ticket and ask for the ticket ref');
  });

  it.each(PLAN_SPLIT_CONSUMERS)('%s sends every split piece to start-ticket', async (slug) => {
    const content = await readContentFile(`skills/${slug}/SKILL.md`);
    expect(content).toContain('start-ticket}`, invoked without arguments');
    expect(countOccurrences(content, RETIRED_ROUTE_LIST)).toBe(0);
  });

  it('keeps review-branch as the entry of a split made after implementation', async () => {
    const content = await readContentFile('skills/implement-plan/SKILL.md');
    expect(content).toContain('Every piece enters at `{skill:review-branch}`');
    expect(content).not.toContain('start-ticket');
  });
});
