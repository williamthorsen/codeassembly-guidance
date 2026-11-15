import { z } from 'zod';

const IssueStateSchema = z.enum(['OPEN', 'CLOSED']);

/** The `gh issue view` fields that the helper requests; `gh` 2.100 is the first to return `blockedBy`. */
export const ISSUE_VIEW_FIELDS = 'number,title,state,url,blockedBy,subIssuesSummary';

export const IssueViewSchema = z.object({
  blockedBy: z.object({
    nodes: z.array(
      z.object({
        number: z.number().int().positive(),
        state: IssueStateSchema,
        title: z.string(),
        url: z.string(),
      }),
    ),
  }),
  number: z.number().int().positive(),
  state: IssueStateSchema,
  subIssuesSummary: z.object({ total: z.number().int().nonnegative() }),
  title: z.string(),
  url: z.string(),
});
