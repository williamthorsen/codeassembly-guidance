/** The dispositions record that the skill writes, and the gate that every record must pass before it is rendered. */
import { z } from 'zod';

/** The outcomes of the challenge on one item. */
export const CHALLENGE_OUTCOMES = ['abandoned', 'defended', 'modified'] as const;

/**
 * The confidence grades, which state how advisable an item is; only an item graded `high` or `medium` gets a ticket.
 */
export const CONFIDENCE_GRADES = ['high', 'low', 'medium'] as const;

/** The dispositions that an item can take. */
export const DISPOSITIONS = ['comment', 'drop', 'merge', 'ticket'] as const;

/** The pattern of a Jira work item key, such as `PROJ-123`. */
export const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-[1-9][0-9]*$/;

/** The ticket platforms that a triage supports: A GitHub issue is a number, and a Jira work item is a key. */
export const PLATFORMS = ['github', 'jira'] as const;

/** The value grades, which state how much an item matters. */
export const VALUE_GRADES = ['must-have', 'nice-to-have', 'questionable', 'should-have'] as const;

const PositiveInteger = z.number().int().positive();

/** A ticket reference on either platform; `checkGate` holds it to the form of the record's platform. */
export const IssueReferenceSchema = z.union([PositiveInteger, z.string().regex(JIRA_KEY_PATTERN)]);

/** What an item is about, so that a later run can recognize the same subject: a stable key and the paths it covers. */
export const EvidenceSchema = z.object({
  key: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1),
});

/** A full commit SHA, which stays unambiguous as the repository grows. */
export const CommitSchema = z.string().regex(/^[0-9a-f]{40}$/);

export const ItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  disposition: z.enum(DISPOSITIONS),
  confidence: z.enum(CONFIDENCE_GRADES),
  value: z.enum(VALUE_GRADES),
  reason: z.string().min(1),
  target: z.union([PositiveInteger, z.string().min(1), z.null()]),
  ticket: IssueReferenceSchema.nullable(),
  /** The blockers of a `ticket` item: the ids of other `ticket` items, and the issues outside the triage. */
  blockedBy: z.array(z.union([PositiveInteger, z.string().min(1)])).optional(),
  evidence: EvidenceSchema.optional(),
  challenge: z.object({
    argument: z.string(),
    outcome: z.enum(CHALLENGE_OUTCOMES),
    note: z.string(),
  }),
});

export const RecordSchema = z.object({
  /** Absent in a record written before Jira was supported, which is therefore a GitHub record. */
  platform: z.enum(PLATFORMS).default('github'),
  source: z.string().min(1),
  triageTicket: IssueReferenceSchema,
  /** Always null on Jira, which does not have an umbrella. */
  umbrella: IssueReferenceSchema.nullable(),
  /** The HEAD at which the dispositions were approved; required when any item has evidence. */
  commit: CommitSchema.optional(),
  items: z.array(ItemSchema).min(1),
  challengeSummary: z.string(),
  notes: z.array(z.string()),
});

export type ChallengeOutcome = (typeof CHALLENGE_OUTCOMES)[number];
export type ConfidenceGrade = (typeof CONFIDENCE_GRADES)[number];
export type Disposition = (typeof DISPOSITIONS)[number];
export type DispositionsRecord = z.infer<typeof RecordSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type IssueReference = z.infer<typeof IssueReferenceSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Platform = (typeof PLATFORMS)[number];
export type ValueGrade = (typeof VALUE_GRADES)[number];

/** One clause of the gate that an item fails. */
export interface GateViolation {
  clause: string;
  id: string;
}

/**
 * Checks a parsed record against the gate: every issue reference takes the form of the record's platform; a Jira record
 * does not have an umbrella or an item id shaped like a key; a `low` item never takes a ticket; a `merge` targets a
 * `ticket` item by id; a `comment` targets an issue; a `ticket` or `drop` item does not have a target; only a `ticket`
 * item has a ticket or blockers; a blocker that is not an issue names another `ticket` item, once; the blockers do not
 * form a cycle; an item has evidence only when the record has a commit; and ids are unique.
 * Returns every violation, so that one run reports them all.
 */
export function checkGate(record: DispositionsRecord): GateViolation[] {
  const violations: GateViolation[] = [...checkRecordReferences(record)];
  const byId = new Map<string, Item>();
  for (const item of record.items) {
    if (byId.has(item.id)) violations.push({ id: item.id, clause: 'the id is declared more than once' });
    if (record.platform === 'jira' && JIRA_KEY_PATTERN.test(item.id)) {
      violations.push({ id: item.id, clause: 'an item id on a Jira record is not shaped like a work item key' });
    }
    byId.set(item.id, item);
  }
  const issue = describeReference(record.platform);
  for (const item of record.items) {
    if (item.disposition === 'ticket' && item.confidence === 'low') {
      violations.push({ id: item.id, clause: 'a low item does not take a ticket' });
    }
    if (item.evidence !== undefined && record.commit === undefined) {
      violations.push({ id: item.id, clause: 'an item has evidence only when the record has a commit' });
    }
    if (item.disposition !== 'ticket' && item.ticket !== null) {
      const ticket = record.platform === 'github' ? 'a ticket number' : 'a ticket';
      violations.push({ id: item.id, clause: `a ${item.disposition} item does not have ${ticket}` });
    }
    if (item.ticket !== null && !isReference(item.ticket, record.platform)) {
      violations.push({ id: item.id, clause: `the ticket is ${issue}` });
    }
    violations.push(...checkTarget(item, byId, record.platform), ...checkBlockers(item, byId, record.platform));
  }
  violations.push(...findCycles(record, byId));
  return violations;
}

/**
 * Returns the ids of the `ticket` items without a ticket, and whether the umbrella is missing. Only a GitHub record
 * that has a `ticket` item needs an umbrella, so the umbrella of any other record is never missing.
 */
export function findMissingTickets(record: DispositionsRecord): { items: string[]; umbrella: boolean } {
  return {
    items: record.items.filter((item) => item.disposition === 'ticket' && item.ticket === null).map((item) => item.id),
    umbrella: record.platform === 'github' && record.umbrella === null && hasTicketItem(record),
  };
}

/** Returns whether any item of the record takes a ticket. */
export function hasTicketItem(record: DispositionsRecord): boolean {
  return record.items.some((item) => item.disposition === 'ticket');
}

/**
 * Returns the ids of the `ticket` items that block `item` within the record, skipping every entry that fails the gate,
 * so that the ordering and the cycle check see only valid relations.
 */
export function listInternalBlockers(item: Item, byId: ReadonlyMap<string, Item>): string[] {
  if (item.disposition !== 'ticket') return [];
  const blockers = new Set<string>();
  const entries = item.blockedBy ?? [];
  for (const entry of entries) {
    if (typeof entry === 'string' && entry !== item.id && byId.get(entry)?.disposition === 'ticket') {
      blockers.add(entry);
    }
  }
  return [...blockers];
}

// region | Helpers

/**
 * Checks one item's blockers: only a `ticket` item has any, each is listed once, and each is an issue reference of the
 * platform or the id of another `ticket` item. On Jira, a string that is not an item id is a key.
 */
function checkBlockers(item: Item, byId: ReadonlyMap<string, Item>, platform: Platform): GateViolation[] {
  const blockedBy = item.blockedBy ?? [];
  if (blockedBy.length === 0) return [];
  if (item.disposition !== 'ticket') {
    return [{ id: item.id, clause: `a ${item.disposition} item does not have blockers` }];
  }
  const violations: GateViolation[] = [];
  const seen = new Set<number | string>();
  for (const entry of blockedBy) {
    if (seen.has(entry))
      violations.push({ id: item.id, clause: `the blocker ${String(entry)} is listed more than once` });
    seen.add(entry);
    const unknown =
      platform === 'github'
        ? `the blocker ${String(entry)} is not an item`
        : `the blocker ${String(entry)} is not an item or ${describeReference(platform)}`;
    if (typeof entry !== 'string') {
      if (platform !== 'github') violations.push({ id: item.id, clause: unknown });
      continue;
    }
    const blocker = byId.get(entry);
    if (entry === item.id) {
      violations.push({ id: item.id, clause: 'an item does not block itself' });
    } else if (blocker === undefined) {
      if (!isReference(entry, platform)) violations.push({ id: item.id, clause: unknown });
    } else if (blocker.disposition !== 'ticket') {
      violations.push({ id: item.id, clause: `a blocker is a ticket item, and ${entry} is a ${blocker.disposition}` });
    }
  }
  return violations;
}

/** Checks the record's own references: the triage ticket's form, and the umbrella's form or, on Jira, its absence. */
function checkRecordReferences(record: DispositionsRecord): GateViolation[] {
  const issue = describeReference(record.platform);
  const violations: GateViolation[] = [];
  if (!isReference(record.triageTicket, record.platform)) {
    violations.push({ id: 'triageTicket', clause: `the triage ticket is ${issue}` });
  }
  if (record.platform === 'jira' && record.umbrella !== null) {
    violations.push({ id: 'umbrella', clause: 'a Jira record does not have an umbrella' });
  } else if (record.umbrella !== null && !isReference(record.umbrella, record.platform)) {
    violations.push({ id: 'umbrella', clause: `the umbrella is ${issue}` });
  }
  return violations;
}

/** Checks one item's target: a `comment` names an issue, a `merge` names a `ticket` item, and any other has none. */
function checkTarget(item: Item, byId: ReadonlyMap<string, Item>, platform: Platform): GateViolation[] {
  switch (item.disposition) {
    case 'comment':
      if (isReference(item.target, platform)) return [];
      return [{ id: item.id, clause: `a comment names ${describeReference(platform)} as its target` }];
    case 'merge': {
      const target = typeof item.target === 'string' ? byId.get(item.target) : undefined;
      if (target === undefined) {
        return [{ id: item.id, clause: 'a merge names the id of another item as its target' }];
      }
      if (target.disposition !== 'ticket') {
        return [{ id: item.id, clause: `a merge targets a ticket item, and ${target.id} is a ${target.disposition}` }];
      }
      return [];
    }
    default:
      if (item.target === null) return [];
      return [{ id: item.id, clause: `a ${item.disposition} item does not have a target` }];
  }
}

/** Names the form of an issue reference on `platform`, for a gate clause. */
function describeReference(platform: Platform): string {
  return platform === 'github' ? 'an issue number' : 'a work item key';
}

/** Reports each cycle among the `ticket` items' blockers once, against the item at which the search re-entered it. */
function findCycles(record: DispositionsRecord, byId: ReadonlyMap<string, Item>): GateViolation[] {
  const violations: GateViolation[] = [];
  const done = new Set<string>();
  const path: string[] = [];
  function visit(id: string): void {
    const start = path.indexOf(id);
    if (start !== -1) {
      const cycle = [...path.slice(start), id];
      violations.push({ id, clause: `a blocked-by cycle: ${cycle.join(' → ')}` });
      return;
    }
    if (done.has(id)) return;
    const item = byId.get(id);
    if (item === undefined) return;
    path.push(id);
    for (const blocker of listInternalBlockers(item, byId)) visit(blocker);
    path.pop();
    done.add(id);
  }
  for (const item of record.items) visit(item.id);
  return violations;
}

/** Returns whether `value` is an issue reference in the form of `platform`. */
function isReference(value: unknown, platform: Platform): boolean {
  return platform === 'github'
    ? PositiveInteger.safeParse(value).success
    : typeof value === 'string' && JIRA_KEY_PATTERN.test(value);
}

// endregion | Helpers
