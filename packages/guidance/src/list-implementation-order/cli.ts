/* eslint n/no-process-exit: off -- CLI entry point: The process must exit non-zero on failure, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the list-implementation-order helper: reads the named tickets and their blockers, and prints them
// as JSON in implementation order, arranged as a tree.

import { execFile } from 'node:child_process';
import process from 'node:process';
import { promisify } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { scanFlags } from '../lib/parse-flags.ts';
import { isEnoent, isRecord } from '../lib/type-guards.ts';
import { fetchTicket, type GhResult, type GhRunner, type GithubTicket, parseTicketRef } from './fetch.ts';
import { type Edge, orderTickets } from './order.ts';
import { derivePrefixes } from './prefix.ts';

/** A blocker that a ticket's place in the tree does not state. */
export interface ListedBlocker {
  /** Whether the blocker and the blocked ticket are in different GitHub repositories. */
  crossRepository: boolean;
  label: string;
  number: number | null;
  prefix: string | null;
  ref: string;
  repository: string | null;
}

/** One line of the list. */
export interface ListedTicket {
  /** The whole line that names `otherBlockers`, or null when there are none. */
  blockerLine: string | null;
  depth: number;
  /** The start of the line that states a publish gate after this ticket; the caller adds the package and its consumers. */
  gateLead: string;
  /** The ticket's name in the list: `PREFIX.N`, or the key of a ticket outside GitHub. */
  label: string;
  /** The start of the ticket's line, up to the title: the indent, the dash, and the label. */
  lead: string;
  number: number | null;
  /** The open blockers other than the ticket under which this one is listed. */
  otherBlockers: ListedBlocker[];
  prefix: string | null;
  ref: string;
  repository: string | null;
  title: string;
  /** The characters left for the title once the indent, the dash, and the label are counted. */
  titleBudget: number;
}

/** The helper's output. */
export interface ImplementationOrder {
  /** The listed tickets that block each other, by `ref`. */
  cycle: string[];
  /** The closed tickets that were named, by `ref`. */
  omitted: string[];
  tickets: ListedTicket[];
}

const PROGRAM = 'list-implementation-order';

/** The most characters that a ticket's line may have, its indent included. */
const LINE_WIDTH = 60;

const INDENT_WIDTH = 2;

const execFileAsync = promisify(execFile);

/**
 * Lists the tickets that `argv` names in implementation order. `--ticket OWNER/REPO#N` names a GitHub ticket,
 * `--external KEY=Title` a ticket outside GitHub, and `--edge BLOCKER>BLOCKED` a dependency that GitHub does not
 * record. Closed tickets are left out, as tickets and as blockers.
 *
 * Throws on a malformed flag, an edge naming an unknown ticket, and a ticket that cannot be read.
 */
export async function listImplementationOrder(argv: readonly string[], gh: GhRunner): Promise<ImplementationOrder> {
  const request = parseRequest(argv);

  const entries = new Map<string, Entry>();
  const edges: Edge[] = [];
  const fetched = await Promise.all(request.tickets.map((ticket) => fetchTicket(gh, ticket)));
  for (const [index, ticket] of fetched.entries()) {
    const id = request.listedIds[index] ?? buildId(ticket);
    for (const blocker of ticket.blockers) {
      edges.push({ blocked: id, blocker: buildId(blocker) });
      entries.set(buildId(blocker), blocker);
    }
  }
  for (const [index, ticket] of fetched.entries()) {
    entries.set(request.listedIds[index] ?? buildId(ticket), ticket);
  }
  for (const external of request.externals) {
    entries.set(external.key, { external: true, key: external.key, open: true, title: external.title });
  }

  const unlisted = new Set(request.edges.map((edge) => edge.blocker).filter((id) => !entries.has(id)));
  for (const id of unlisted) {
    const ticket = parseTicketRef(id);
    if (ticket !== undefined) {
      entries.set(id, await fetchTicket(gh, ticket));
    }
  }
  edges.push(...request.edges);

  const listed = [...request.order];
  const active = listed.filter((id) => entries.get(id)?.open === true);
  const { cycle, placed } = orderTickets(active, edges);

  const shown = new Set([...active, ...active.flatMap((id) => findOpenBlockers(id, edges, entries))]);
  const prefixes = derivePrefixes([...shown].flatMap((id) => readRepository(entries.get(id)) ?? []));

  return {
    cycle: cycle.map((id) => describeEntry(id, entries, prefixes).ref),
    omitted: listed.filter((id) => !active.includes(id)).map((id) => describeEntry(id, entries, prefixes).ref),
    tickets: placed.map(({ depth, id, parent }) => {
      const ticket = describeEntry(id, entries, prefixes);
      const otherBlockers = findOpenBlockers(id, edges, entries)
        .filter((blocker) => blocker !== parent)
        .map((blocker) => {
          const { label, number, prefix, ref, repository } = describeEntry(blocker, entries, prefixes);
          const crossRepository = isCrossRepository(repository, ticket.repository);
          return { crossRepository, label, number, prefix, ref, repository };
        });
      const lead = `${' '.repeat(depth * INDENT_WIDTH)}— ${ticket.label} `;
      const noteIndent = ' '.repeat((depth + 1) * INDENT_WIDTH);
      return {
        blockerLine:
          otherBlockers.length === 0
            ? null
            : `${noteIndent}⛔ by ${otherBlockers.map(({ label }) => label).join(', ')}`,
        depth,
        gateLead: `${noteIndent}📦 publish `,
        label: ticket.label,
        lead,
        number: ticket.number,
        otherBlockers,
        prefix: ticket.prefix,
        ref: ticket.ref,
        repository: ticket.repository,
        title: ticket.title,
        titleBudget: Math.max(0, LINE_WIDTH - lead.length),
      };
    }),
  };
}

/** Prints the implementation order of the tickets that the arguments name. */
async function main(): Promise<void> {
  try {
    const order = await listImplementationOrder(process.argv.slice(2), runGh);
    process.stdout.write(`${JSON.stringify(order)}\n`);
  } catch (error) {
    process.stderr.write(`${PROGRAM}: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, PROGRAM)) {
  await main();
}

// region | Helpers

/** A ticket outside GitHub, which the caller describes. */
interface ExternalTicket {
  external: true;
  key: string;
  open: true;
  title: string;
}

type Entry = ExternalTicket | GithubTicket;

/** A ticket's identity as the output states it. */
type Described = Omit<ListedBlocker, 'crossRepository'> & { title: string };

/** What the arguments ask for, with every ticket named by its id. */
interface Request {
  edges: Edge[];
  externals: Array<{ key: string; title: string }>;
  /** The ids of `tickets`, index for index. */
  listedIds: string[];
  /** The ids of the GitHub tickets and the external tickets, in the order in which the arguments name them. */
  order: string[];
  tickets: Array<{ number: number; repository: string }>;
}

/** Builds the id under which a GitHub ticket is known, which ignores the case of the repository. */
function buildId(ticket: { number: number; repository: string }): string {
  return `${ticket.repository.toLowerCase()}#${ticket.number}`;
}

/** Describes the ticket with the given id; an id without a record describes itself. */
function describeEntry(
  id: string,
  entries: ReadonlyMap<string, Entry>,
  prefixes: ReadonlyMap<string, string>,
): Described {
  const entry = entries.get(id);
  if (entry === undefined || 'external' in entry) {
    return { label: id, number: null, prefix: null, ref: id, repository: null, title: entry?.title ?? '' };
  }
  const prefix = prefixes.get(entry.repository) ?? entry.repository.toUpperCase();
  return {
    label: `${prefix}.${entry.number}`,
    number: entry.number,
    prefix,
    ref: `${entry.repository}#${entry.number}`,
    repository: entry.repository,
    title: entry.title,
  };
}

/** Returns the ids of the open tickets that block `id`, each once, in the order of `edges`. */
function findOpenBlockers(id: string, edges: readonly Edge[], entries: ReadonlyMap<string, Entry>): string[] {
  const blockers = edges
    .filter((edge) => edge.blocked === id && edge.blocker !== id && entries.get(edge.blocker)?.open === true)
    .map((edge) => edge.blocker);
  return [...new Set(blockers)];
}

/** Reports whether two tickets are in different GitHub repositories; a ticket outside GitHub is in none. */
function isCrossRepository(one: string | null, other: string | null): boolean {
  return one !== null && other !== null && one.toLowerCase() !== other.toLowerCase();
}

/** Parses the arguments into the tickets, the external tickets, and the supplied edges. */
function parseRequest(argv: readonly string[]): Request {
  const { flags, positionals } = scanFlags(argv, [
    { name: 'edge', takesValue: true },
    { name: 'external', takesValue: true },
    { name: 'ticket', takesValue: true },
  ]);
  if (positionals.length > 0) {
    throw new Error(`unexpected argument: ${positionals.join(' ')}`);
  }

  const request: Request = { edges: [], externals: [], listedIds: [], order: [], tickets: [] };
  for (const { name, value } of flags) {
    const text = value?.trim() ?? '';
    if (name === 'ticket') {
      const ticket = parseTicketRef(text);
      if (ticket === undefined) {
        throw new Error(`--ticket takes OWNER/REPO#N; got ${text}`);
      }
      if (!request.order.includes(buildId(ticket))) {
        request.tickets.push(ticket);
        request.listedIds.push(buildId(ticket));
        request.order.push(buildId(ticket));
      }
    } else if (name === 'external') {
      const separator = text.indexOf('=');
      const key = text.slice(0, Math.max(0, separator)).trim();
      const title = text.slice(separator + 1).trim();
      if (key === '' || title === '' || key.includes('>') || parseTicketRef(key) !== undefined) {
        throw new Error(`--external takes KEY=Title, with a key that contains neither > nor =; got ${text}`);
      }
      if (request.order.includes(key)) {
        throw new Error(`--external names ${key} twice`);
      }
      request.externals.push({ key, title });
      request.order.push(key);
    }
  }

  // Edges are parsed last, because an edge may name an external ticket that a later flag declares.
  for (const { name, value } of flags) {
    if (name === 'edge') {
      request.edges.push(parseEdge(value ?? '', request));
    }
  }
  return request;
}

/** Parses `BLOCKER>BLOCKED` into an edge between two ticket ids; throws when a side does not name a known ticket. */
function parseEdge(text: string, request: Request): Edge {
  const separator = text.indexOf('>');
  const blocker = resolveEdgeSide(text.slice(0, Math.max(0, separator)).trim(), request);
  const blocked = resolveEdgeSide(text.slice(separator + 1).trim(), request);
  if (separator === -1 || blocker === undefined || blocked === undefined) {
    throw new Error(`--edge takes BLOCKER>BLOCKED, each OWNER/REPO#N or a declared --external key; got ${text}`);
  }
  if (!request.order.includes(blocked)) {
    throw new Error(`--edge names ${blocked} as blocked, but no --ticket or --external names it`);
  }
  return { blocked, blocker };
}

/** Returns the `owner/repo` of a GitHub ticket, or `undefined` for any other entry. */
function readRepository(entry: Entry | undefined): string | undefined {
  return entry === undefined || 'external' in entry ? undefined : entry.repository;
}

/** Resolves one side of an edge to a ticket id, or returns `undefined` when it names neither kind of ticket. */
function resolveEdgeSide(text: string, request: Request): string | undefined {
  const ticket = parseTicketRef(text);
  if (ticket !== undefined) {
    return buildId(ticket);
  }
  return request.externals.some((external) => external.key === text) ? text : undefined;
}

/** Runs `gh` without a shell and reports its exit code and output; throws when `gh` cannot be started. */
async function runGh(args: readonly string[]): Promise<GhResult> {
  try {
    const { stderr, stdout } = await execFileAsync('gh', args, { maxBuffer: 16_777_216 });
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error('gh is not installed or not on PATH', { cause: error });
    }
    if (
      isRecord(error) &&
      typeof error['code'] === 'number' &&
      typeof error['stderr'] === 'string' &&
      typeof error['stdout'] === 'string'
    ) {
      return { exitCode: error['code'], stderr: error['stderr'], stdout: error['stdout'] };
    }
    throw error;
  }
}

// endregion | Helpers
