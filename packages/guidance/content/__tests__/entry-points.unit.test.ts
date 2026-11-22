import { describe, expect, it } from 'vitest';

import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { readContentFile } from '../test-utils/read-content-file.ts';

// The entry-point rule is stated once, in a data file that `start-ticket` applies when a session starts. The plan
// skills' split reports name `start-ticket` instead of choosing a skill, so a copy of the route list that reappears
// in one of them drifts from the data file without anything reporting it.

const ENTRY_POINTS = 'skills/_data/entry-points.md';
const WORKFLOW_PREFERENCES = 'guidance/rulebooks/williamthorsen-workflow-preferences.md';

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
  { skill: 'triage-spike-findings', condition: '`triage/dispositions.json` without a `dispositions` artifact' },
];

/** The skills whose split report includes the launch prompts of a plan-time split. */
const PLAN_SPLIT_CONSUMERS: ReadonlyArray<string> = ['design-and-plan', 'plan', 'refine-plan', 'save-plan'];

/** The skills whose report lists tickets that the run created, for sessions that start later. */
const BATCH_REPORTERS: ReadonlyArray<string> = ['triage-feedback', 'triage-spike-findings', 'wrap-up'];

/** The line that a batch report prints once, before the rendered name of the skill. */
const LAUNCH_LINE = 'Start each ticket in its own worktree: ';

/** The opening of the route list that the split report stated before the rule moved to the data file. */
const RETIRED_ROUTE_LIST = "Choose each ticket's entry point";

describe('entry points', () => {
  it.each(ROUTES)('routes to $skill', async ({ skill, condition }) => {
    const content = await readContentFile(ENTRY_POINTS);
    const skillName = new RegExp(String.raw`(?<![\w-])${skill}(?![\w-])`);
    const routeLines = content.split('\n').filter((line) => line.includes(condition));
    expect(routeLines, `no route states "${condition}"`).not.toHaveLength(0);
    expect(routeLines.some((line) => skillName.test(line))).toBe(true);
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

  it.each([...PLAN_SPLIT_CONSUMERS, 'implement-plan'])(
    '%s leaves the contents of a launch prompt to its own split report',
    async (slug) => {
      const content = await readContentFile(`skills/${slug}/SKILL.md`);
      expect(content).toContain('which the **Report** paragraph above names');
      expect(content).not.toContain('{entry_skill}');
    },
  );

  it.each(PLAN_SPLIT_CONSUMERS)('%s puts start-ticket alone in the launch prompt of a split', async (slug) => {
    const content = await readContentFile(`skills/${slug}/SKILL.md`);
    expect(content).toContain(
      'contains that invocation alone, without a plan path, a scope note, a blocker, or another skill',
    );
    expect(content).toContain("into the `## Dependencies` section of that piece's plan before its ticket is created");
  });

  it('keeps the review-branch invocation, scope notes, and blockers in the prompt of a split made after implementation', async () => {
    const content = await readContentFile('skills/implement-plan/SKILL.md');
    expect(content).toContain("`--diff-base=<previous piece's branch>`");
    expect(content).toContain(
      "then the scope notes that the session needs and that the artifacts do not state, then the ticket's blockers",
    );
  });

  it.each(BATCH_REPORTERS)('%s names start-ticket once in its report of created tickets', async (slug) => {
    const content = await readContentFile(`skills/${slug}/SKILL.md`);
    expect(countOccurrences(content, LAUNCH_LINE)).toBe(1);
    expect(content).toContain('Print it once per report, not once per ticket');
  });

  it('names start-ticket for the ticket that pull-from-backlog picks', async () => {
    const content = await readContentFile('skills/pull-from-backlog/SKILL.md');
    expect(content).toContain('Start #{N} in its own worktree: ');
    expect(content).toMatch(/Start #\{N\} in its own worktree: \S*start-ticket/);
  });

  it('asks instead of invoking on conflicting evidence or an unclear judgment', async () => {
    const dataFile = await readContentFile(ENTRY_POINTS);
    expect(dataFile).toContain('## When to ask instead');
    expect(dataFile).toContain('**Conflicting evidence.** The first match is route 3 or route 4');
    expect(dataFile).toContain('**An unclear judgment.**');
    expect(dataFile).toContain('A judgment that the reading settles is announced with its reason and invoked.');

    const skill = await readContentFile('skills/start-ticket/SKILL.md');
    expect(countOccurrences(skill, '#when-to-ask-instead')).toBe(2);
    expect(skill).toContain('name the candidate skills, and ask, rather than invoke');
  });

  it('names start-ticket in its description as the command for a fresh session', async () => {
    const content = await readContentFile('skills/start-ticket/SKILL.md');
    expect(content).toMatch(/^description: Start or resume the work in a ticket's worktree/m);
    expect(content).toContain('when stating how a fresh session starts or resumes a ticket');
  });

  it('limits the workflow rule on the launch command to a fresh session', async () => {
    const content = await readContentFile(WORKFLOW_PREFERENCES);
    expect(content).toContain(
      "When telling the developer how to start or resume a ticket's work in a fresh session, name `start-ticket`",
    );
    expect(content).toContain('a next-steps menu within a session names its own skills');
    expect(content).toContain('outside a skill that closes with its own next-steps menu');
  });

  it('has create-ticket offer to start the ticket of its own branch', async () => {
    const content = await readContentFile('skills/create-ticket/SKILL.md');
    expect(content).toContain('Nothing else, with one exception.');
    expect(content).toContain("Step 6 persisted the branch association, so the new ticket is the branch's own.");
    expect(content).toContain("When a step of another skill invoked it, that skill's report closes the turn.");
  });

  it('keeps review-branch as the entry of a split made after implementation', async () => {
    const content = await readContentFile('skills/implement-plan/SKILL.md');
    expect(content).toContain('Every piece enters at `{skill:review-branch}`');
    expect(content).not.toContain('start-ticket');
  });
});
