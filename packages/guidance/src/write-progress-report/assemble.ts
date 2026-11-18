import type { ProgressItem, Workstream } from './schemas.ts';

/** The status that `assemble` assigns to an item that the report shows. */
export type ProgressStatus = 'done' | 'in-progress' | 'needs-input' | 'planned';

/** The inclusive range of completion dates within which a done item is reported. */
export interface ReportPeriod {
  end: string;
  start: string;
}

/** One row of the report: the item, its status with the label that shows it, and its date cell. */
export type ReportRow = ProgressItem & {
  /** The text of the row's date cell. */
  date: string;
  label: string;
  /** Whether the row is open and its date precedes the report's date. */
  overdue: boolean;
  status: ProgressStatus;
};

/** The rows of one workstream, or of the items that do not name one when `workstream` is null. */
export interface ReportSection {
  rows: ReportRow[];
  workstream: Workstream | null;
}

/** An item that the report leaves out, and why. */
export interface OmittedItem {
  id: string;
  reason: 'closed-not-completed' | 'outside-period';
}

/** The report's sections in order, the date that it reports, and the items left out. */
export interface AssembledReport {
  lastUpdated: string;
  omitted: OmittedItem[];
  period: ReportPeriod | null;
  sections: ReportSection[];
}

/** The label of each status, in the order in which a section lists them. */
const STATUS_DISPLAY: Readonly<Record<ProgressStatus, { label: string; prefix: string; rank: number }>> = {
  'needs-input': { label: 'Needs input', prefix: 'Needed by', rank: 0 },
  done: { label: 'Done', prefix: 'Done', rank: 1 },
  'in-progress': { label: 'In progress', prefix: 'Target', rank: 2 },
  planned: { label: 'Planned', prefix: 'Target', rank: 3 },
};

/**
 * Assigns each item its status, leaves out the items that the report does not show, and groups the rest into
 * sections: the declared workstreams in declaration order, then undeclared ones in order of first appearance, then the
 * items without a workstream. Each section lists its rows by status, then by date with undated rows last, keeping
 * source order for ties.
 */
export function assembleReport(
  items: readonly ProgressItem[],
  workstreams: readonly Workstream[],
  period: ReportPeriod | null,
  today: string,
): AssembledReport {
  const omitted: OmittedItem[] = [];
  const sections = new Map<string | null, ReportSection>(
    workstreams.map((workstream) => [workstream.id, { rows: [], workstream }]),
  );
  for (const item of items) {
    const status = assignStatus(item);
    if (status === null) {
      omitted.push({ id: item.id, reason: 'closed-not-completed' });
      continue;
    }
    if (status === 'done' && !isWithinPeriod(item.completedOn, period)) {
      omitted.push({ id: item.id, reason: 'outside-period' });
      continue;
    }
    readSection(sections, item.workstream).rows.push(buildRow(item, status, today));
  }

  const ordered = [...sections.entries()]
    .sort(([left], [right]) => Number(left === null) - Number(right === null))
    .map(([, section]) => ({ ...section, rows: section.rows.toSorted(compareRows) }))
    .filter((section) => section.rows.length > 0);
  return { lastUpdated: today, omitted, period, sections: ordered };
}

// region | Helpers

/** Returns the status of an item that the report shows, or null for one closed other than as completed. */
function assignStatus(item: ProgressItem): ProgressStatus | null {
  if (item.closed) {
    return item.completed ? 'done' : null;
  }
  if (item.needsInput) return 'needs-input';
  return item.started ? 'in-progress' : 'planned';
}

/** Builds a row whose date cell names the kind of date that its status uses. */
function buildRow(item: ProgressItem, status: ProgressStatus, today: string): ReportRow {
  const { label, prefix } = STATUS_DISPLAY[status];
  const sortDate = readSortDate(item, status);
  return {
    ...item,
    date: sortDate === null ? 'Not yet scheduled' : `${prefix}: ${sortDate}`,
    label,
    overdue: status !== 'done' && sortDate !== null && sortDate < today,
    status,
  };
}

/** Orders rows by status, then dated before undated and ascending by date; a stable sort keeps source order for ties. */
function compareRows(left: ReportRow, right: ReportRow): number {
  const byStatus = STATUS_DISPLAY[left.status].rank - STATUS_DISPLAY[right.status].rank;
  if (byStatus !== 0) return byStatus;
  const leftDate = readSortDate(left, left.status);
  const rightDate = readSortDate(right, right.status);
  if (leftDate === rightDate) return 0;
  if (leftDate === null) return 1;
  if (rightDate === null) return -1;
  return leftDate < rightDate ? -1 : 1;
}

/** Returns whether a completion date falls within the period. */
function isWithinPeriod(completedOn: string | null, period: ReportPeriod | null): boolean {
  if (period === null || completedOn === null) {
    return true;
  }
  return completedOn >= period.start && completedOn <= period.end;
}

/** Returns the section of a workstream, adding one titled by its id for a workstream that the file does not declare. */
function readSection(sections: Map<string | null, ReportSection>, id: string | null): ReportSection {
  let section = sections.get(id);
  if (section === undefined) {
    section = { rows: [], workstream: id === null ? null : { id, title: id } };
    sections.set(id, section);
  }
  return section;
}

/** Returns the date by which a row sorts and which its date cell shows. */
function readSortDate(item: ProgressItem, status: ProgressStatus): string | null {
  if (status === 'needs-input') return item.neededBy;
  return status === 'done' ? item.completedOn : item.targetOn;
}

// endregion | Helpers
