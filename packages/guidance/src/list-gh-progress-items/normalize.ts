import type { ProgressItem } from '../write-progress-report/schemas.ts';
import type { GithubIssue } from './fetch.ts';

/**
 * States a GitHub issue's progress facts in the item contract. An issue has started when it has an assignee or a
 * linked pull request, and its milestone's due date is its expected completion date.
 */
export function normalizeIssue(issue: GithubIssue): ProgressItem {
  const closed = issue.state === 'CLOSED';
  return {
    closed,
    completed: closed && issue.stateReason === 'COMPLETED',
    completedOn: readUtcDate(issue.closedAt),
    description: issue.body === '' ? null : issue.body,
    expectedOn: readUtcDate(issue.milestone?.dueOn ?? null),
    id: `#${issue.number}`,
    started: issue.assignees.length > 0 || issue.closedByPullRequestsReferences.length > 0,
    title: issue.title,
    url: issue.url,
  };
}

// region | Helpers

/**
 * Returns the UTC date of an ISO timestamp. GitHub stores a milestone's due date as midnight UTC, which a local
 * conversion would move to the previous day west of UTC.
 */
function readUtcDate(timestamp: string | null): string | null {
  return timestamp === null || timestamp === '' ? null : timestamp.slice(0, 10);
}

// endregion | Helpers
