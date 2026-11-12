import { ISSUE_VIEW_FIELDS, IssueViewSchema } from './schemas.ts';

/** What one `gh` call reported. */
export interface GhResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/** Runs `gh` with the given arguments. */
export type GhRunner = (args: readonly string[]) => Promise<GhResult>;

/** A GitHub issue as the list needs it. */
export interface GithubTicket {
  number: number;
  open: boolean;
  repository: string;
  title: string;
}

/** A ticket read from GitHub, with every blocker that GitHub records for it, open or closed. */
export interface FetchedTicket extends GithubTicket {
  blockers: GithubTicket[];
}

const TICKET_REF_PATTERN = /^([\w.-]+\/[\w.-]+)#(\d+)$/;

const ISSUE_URL_PATTERN = /github\.com\/([\w.-]+\/[\w.-]+)\/issues\/\d+/;

/** Reads one issue and its native blockers through `gh`; throws, naming the ticket, when the issue cannot be read. */
export async function fetchTicket(
  gh: GhRunner,
  ticket: { number: number; repository: string },
): Promise<FetchedTicket> {
  const ref = `${ticket.repository}#${ticket.number}`;
  const result = await gh([
    'issue',
    'view',
    String(ticket.number),
    '--repo',
    ticket.repository,
    '--json',
    ISSUE_VIEW_FIELDS,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`ticket ${ref} cannot be read: ${result.stderr.trim() || `gh exited ${result.exitCode}`}`);
  }

  const parsed = IssueViewSchema.safeParse(parseJson(result.stdout));
  if (!parsed.success) {
    throw new Error(`ticket ${ref}: gh returned an unexpected shape`);
  }
  const issue = parsed.data;
  return {
    blockers: issue.blockedBy.nodes.map((node) => ({
      number: node.number,
      open: node.state === 'OPEN',
      repository: readRepository(node.url) ?? ticket.repository,
      title: node.title,
    })),
    number: issue.number,
    open: issue.state === 'OPEN',
    repository: readRepository(issue.url) ?? ticket.repository,
    title: issue.title,
  };
}

/** Parses `OWNER/REPO#N`, or returns `undefined` for any other text. */
export function parseTicketRef(text: string): { number: number; repository: string } | undefined {
  const match = TICKET_REF_PATTERN.exec(text);
  const repository = match?.[1];
  const number = match?.[2];
  return repository === undefined || number === undefined ? undefined : { number: Number(number), repository };
}

// region | Helpers

/** Parses JSON, or returns `undefined` when the text is not JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Returns the `owner/repo` of an issue URL, in the case that GitHub reports. */
function readRepository(url: string): string | undefined {
  return ISSUE_URL_PATTERN.exec(url)?.[1];
}

// endregion | Helpers
