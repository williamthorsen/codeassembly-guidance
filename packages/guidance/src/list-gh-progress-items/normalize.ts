import type { ProgressItem, ProgressItemsFile, Workstream } from '../write-progress-report/schemas.ts';
import type { GithubIssue } from './fetch.ts';

/**
 * States GitHub issues as an items file. An issue that has sub-issues is a workstream rather than an item, and each
 * item's parent issue is its workstream, declared in order of first appearance.
 */
export function normalizeIssues(issues: readonly GithubIssue[], needsInputLabel: string): ProgressItemsFile {
  const workstreams = new Map<string, Workstream>();
  const items: ProgressItem[] = [];
  for (const issue of issues) {
    if (issue.subIssuesSummary.total > 0) continue;
    const item = normalizeIssue(issue, needsInputLabel);
    if (issue.parent !== null && item.workstream !== null && !workstreams.has(item.workstream)) {
      workstreams.set(item.workstream, { id: item.workstream, title: issue.parent.title });
    }
    items.push(item);
  }
  return { items, workstreams: workstreams.values().toArray() };
}

/**
 * States a GitHub issue's progress facts in the item contract. An issue has started when it has an assignee or a
 * linked pull request, needs input when it has `needsInputLabel`, and takes its milestone's due date as its target.
 */
export function normalizeIssue(issue: GithubIssue, needsInputLabel: string): ProgressItem {
  const closed = issue.state === 'CLOSED';
  return {
    closed,
    completed: closed && issue.stateReason === 'COMPLETED',
    completedOn: readUtcDate(issue.closedAt),
    description: issue.body === '' ? null : issue.body,
    id: `#${issue.number}`,
    neededBy: null,
    needsInput: issue.labels.some(({ name }) => name === needsInputLabel),
    sources: [issue.url],
    started: issue.assignees.length > 0 || issue.closedByPullRequestsReferences.length > 0,
    targetOn: readUtcDate(issue.milestone?.dueOn ?? null),
    title: issue.title,
    workstream: issue.parent === null ? null : `#${issue.parent.number}`,
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
