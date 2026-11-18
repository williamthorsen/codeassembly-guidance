import { z } from 'zod';

import type { CommandRunner } from '../groom-backlog/types.ts';

/** The `gh issue list` fields from which an issue's progress facts are derived. */
const ISSUE_LIST_FIELDS =
  'assignees,body,closedAt,closedByPullRequestsReferences,labels,milestone,number,parent,state,stateReason,subIssuesSummary,title,url';

export const GithubIssueSchema = z.object({
  assignees: z.array(z.object({ login: z.string() })),
  body: z.string(),
  closedAt: z.string().nullable(),
  closedByPullRequestsReferences: z.array(z.object({ number: z.number().int().positive() })),
  labels: z.array(z.object({ name: z.string() })),
  milestone: z.object({ dueOn: z.string().nullable().optional(), title: z.string() }).nullable(),
  number: z.number().int().positive(),
  parent: z.object({ number: z.number().int().positive(), title: z.string() }).nullable(),
  state: z.enum(['CLOSED', 'OPEN']),
  stateReason: z.string().nullable(),
  subIssuesSummary: z.object({ total: z.number().int().nonnegative() }),
  title: z.string(),
  url: z.string(),
});

export type GithubIssue = z.infer<typeof GithubIssueSchema>;

/** What `fetchIssues` reads: the repository, a search query in GitHub's syntax, and the most issues to return. */
export interface IssueQuery {
  limit: number;
  repo: string | undefined;
  scope: string | undefined;
}

/** Lists the issues, open and closed, that `query` selects; throws when `gh` fails or returns an unexpected shape. */
export async function fetchIssues(run: CommandRunner, cwd: string, query: IssueQuery): Promise<GithubIssue[]> {
  const args = ['issue', 'list', '--state', 'all', '--limit', String(query.limit), '--json', ISSUE_LIST_FIELDS];
  if (query.repo !== undefined) {
    args.push('--repo', query.repo);
  }
  if (query.scope !== undefined) {
    args.push('--search', query.scope);
  }
  const stdout = await run('gh', args, cwd);
  return z.array(GithubIssueSchema).parse(JSON.parse(stdout));
}
