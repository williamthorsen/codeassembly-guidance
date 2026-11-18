import { describe, expect, it } from 'vitest';

import type { GithubIssue } from '../fetch.ts';
import { normalizeIssue } from '../normalize.ts';

describe(normalizeIssue, () => {
  it('states an issue closed as completed as completed on the UTC date of its closing', () => {
    const item = normalizeIssue(
      makeIssue({ closedAt: '2026-11-02T23:30:00Z', state: 'CLOSED', stateReason: 'COMPLETED' }),
    );

    expect(item).toMatchObject({ closed: true, completed: true, completedOn: '2026-11-02' });
  });

  it('states an issue closed for another reason as closed and not completed', () => {
    const item = normalizeIssue(
      makeIssue({ closedAt: '2026-11-02T10:00:00Z', state: 'CLOSED', stateReason: 'NOT_PLANNED' }),
    );

    expect(item).toMatchObject({ closed: true, completed: false });
  });

  it.each([
    ['an assignee', { assignees: [{ login: 'octo' }] }, true],
    ['a linked pull request', { closedByPullRequestsReferences: [{ number: 12 }] }, true],
    ['neither', {}, false],
  ])('states an open issue with %s as started: %s', (_label, overrides, started) => {
    expect(normalizeIssue(makeIssue(overrides)).started).toBe(started);
  });

  it("takes the target date from the milestone's UTC due date", () => {
    const withDue = normalizeIssue(makeIssue({ milestone: { dueOn: '2026-12-01T00:00:00Z', title: 'v2' } }));
    const withoutDue = normalizeIssue(makeIssue({ milestone: { dueOn: null, title: 'v2' } }));
    const withoutMilestone = normalizeIssue(makeIssue({ milestone: null }));

    expect([withDue.targetOn, withoutDue.targetOn, withoutMilestone.targetOn]).toStrictEqual([
      '2026-12-01',
      null,
      null,
    ]);
  });

  it('identifies the item by issue number and keeps its title, body, and URL as its source', () => {
    const item = normalizeIssue(makeIssue({ body: 'Context.', number: 9 }));

    expect(item).toMatchObject({
      description: 'Context.',
      id: '#9',
      sources: ['https://github.com/acme/widgets/issues/9'],
      title: 'Export reports',
    });
    expect(normalizeIssue(makeIssue({ body: '' })).description).toBeNull();
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
    milestone: null,
    number,
    state: 'OPEN',
    stateReason: null,
    title: 'Export reports',
    url: `https://github.com/acme/widgets/issues/${number}`,
    ...overrides,
  };
}

// endregion | Helpers
