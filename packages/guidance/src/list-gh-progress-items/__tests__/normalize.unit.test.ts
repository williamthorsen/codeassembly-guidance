import { describe, expect, it } from 'vitest';

import type { GithubIssue } from '../fetch.ts';
import { normalizeIssue, normalizeIssues } from '../normalize.ts';

const NEEDS_INPUT_LABEL = 'needs-input';

describe(normalizeIssue, () => {
  it('states an issue closed as completed as completed on the UTC date of its closing', () => {
    const item = normalizeIssue(
      makeIssue({ closedAt: '2026-11-02T23:30:00Z', state: 'CLOSED', stateReason: 'COMPLETED' }),
      NEEDS_INPUT_LABEL,
    );

    expect(item).toMatchObject({ closed: true, completed: true, completedOn: '2026-11-02' });
  });

  it('states an issue closed for another reason as closed and not completed', () => {
    const item = normalizeIssue(
      makeIssue({ closedAt: '2026-11-02T10:00:00Z', state: 'CLOSED', stateReason: 'NOT_PLANNED' }),
      NEEDS_INPUT_LABEL,
    );

    expect(item).toMatchObject({ closed: true, completed: false });
  });

  it.each([
    ['an assignee', { assignees: [{ login: 'octo' }] }, true],
    ['a linked pull request', { closedByPullRequestsReferences: [{ number: 12 }] }, true],
    ['neither', {}, false],
  ])('states an open issue with %s as started: %s', (_label, overrides, started) => {
    expect(normalizeIssue(makeIssue(overrides), NEEDS_INPUT_LABEL).started).toBe(started);
  });

  it("takes the target date from the milestone's UTC due date", () => {
    const withDue = normalizeIssue(
      makeIssue({ milestone: { dueOn: '2026-12-01T00:00:00Z', title: 'v2' } }),
      NEEDS_INPUT_LABEL,
    );
    const withoutDue = normalizeIssue(makeIssue({ milestone: { dueOn: null, title: 'v2' } }), NEEDS_INPUT_LABEL);
    const withoutMilestone = normalizeIssue(makeIssue({ milestone: null }), NEEDS_INPUT_LABEL);

    expect([withDue.targetOn, withoutDue.targetOn, withoutMilestone.targetOn]).toStrictEqual([
      '2026-12-01',
      null,
      null,
    ]);
  });

  it('identifies the item by issue number and keeps its title, body, and URL as its source', () => {
    const item = normalizeIssue(makeIssue({ body: 'Context.', number: 9 }), NEEDS_INPUT_LABEL);

    expect(item).toMatchObject({
      description: 'Context.',
      id: '#9',
      sources: ['https://github.com/acme/widgets/issues/9'],
      title: 'Export reports',
    });
    expect(normalizeIssue(makeIssue({ body: '' }), NEEDS_INPUT_LABEL).description).toBeNull();
  });
});

describe(normalizeIssue, () => {
  it('states an issue with the needs-input label as needing input', () => {
    const labelled = makeIssue({ labels: [{ name: 'bug' }, { name: NEEDS_INPUT_LABEL }] });

    expect(normalizeIssue(labelled, NEEDS_INPUT_LABEL).needsInput).toBe(true);
    expect(normalizeIssue(labelled, 'waiting-on-customer').needsInput).toBe(false);
  });

  it("names the parent issue as the item's workstream", () => {
    expect(
      normalizeIssue(
        makeIssue({ parent: { title: 'Invoicing', url: 'https://github.com/acme/plans/issues/4' } }),
        NEEDS_INPUT_LABEL,
      ).workstream,
    ).toBe('https://github.com/acme/plans/issues/4');
    expect(normalizeIssue(makeIssue(), NEEDS_INPUT_LABEL).workstream).toBeNull();
  });
});

describe(normalizeIssues, () => {
  it('declares each parent as a workstream in order of first appearance, and does not list an issue that has sub-issues', () => {
    const invoicing = { title: 'Invoicing', url: 'https://github.com/acme/widgets/issues/4' };
    const file = normalizeIssues(
      [
        makeIssue({ number: 4, subIssuesSummary: { total: 2 } }),
        makeIssue({ number: 7, parent: { title: 'Reporting', url: 'https://github.com/acme/plans/issues/5' } }),
        makeIssue({ number: 6, parent: invoicing }),
        makeIssue({ number: 8, parent: invoicing }),
        makeIssue({ number: 9 }),
      ],
      NEEDS_INPUT_LABEL,
    );

    expect(file.items.map(({ id, workstream }) => [id, workstream])).toStrictEqual([
      ['#7', 'https://github.com/acme/plans/issues/5'],
      ['#6', 'https://github.com/acme/widgets/issues/4'],
      ['#8', 'https://github.com/acme/widgets/issues/4'],
      ['#9', null],
    ]);
    expect(file.workstreams).toStrictEqual([
      { id: 'https://github.com/acme/plans/issues/5', title: 'Reporting' },
      { id: 'https://github.com/acme/widgets/issues/4', title: 'Invoicing' },
    ]);
  });
});

// region | Helpers

/** Builds an open, unassigned issue without a milestone, overridden by `overrides`. */
function makeIssue(overrides: Partial<GithubIssue> = {}): GithubIssue {
  const number = overrides.number ?? 9;
  return {
    assignees: [],
    body: '',
    closedAt: null,
    closedByPullRequestsReferences: [],
    labels: [],
    milestone: null,
    number,
    parent: null,
    state: 'OPEN',
    stateReason: null,
    subIssuesSummary: { total: 0 },
    title: 'Export reports',
    url: `https://github.com/acme/widgets/issues/${number}`,
    ...overrides,
  };
}

// endregion | Helpers
