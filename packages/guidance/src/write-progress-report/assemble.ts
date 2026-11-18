import type { ProgressItem } from './schemas.ts';

/** The status that `assemble` assigns to an item that the report shows. */
export type ProgressStatus = 'done' | 'in-progress' | 'planned';

/** The inclusive range of completion dates within which a done item is reported. */
export interface ReportPeriod {
  end: string;
  start: string;
}

/** One row of the report: the item, its status with the glyph and label that show it, and its date cell. */
export type ReportRow = ProgressItem & {
  /** The text of the row's date cell: empty for an undated row. */
  date: string;
  dateKind: 'completed' | 'expected' | null;
  glyph: string;
  label: string;
  status: ProgressStatus;
};

/** An item that the report leaves out, and why. */
export interface OmittedItem {
  id: string;
  reason: 'closed-not-completed' | 'outside-period';
}

/** The report's rows in order, the count per status, and the items left out. */
export interface AssembledReport {
  counts: { done: number; inProgress: number; planned: number };
  omitted: OmittedItem[];
  period: ReportPeriod | null;
  rows: ReportRow[];
}

/** The glyph and label of each status, in the order in which the sort breaks a tie between statuses. */
const STATUS_DISPLAY: Readonly<Record<ProgressStatus, { glyph: string; label: string; rank: number }>> = {
  done: { glyph: '✅', label: 'Done', rank: 0 },
  'in-progress': { glyph: '🔄', label: 'In progress', rank: 1 },
  planned: { glyph: '🗓️', label: 'Planned', rank: 2 },
};

const ID_COLLATOR = new Intl.Collator('en', { numeric: true });

/**
 * Assigns each item its status, leaves out the items that the report does not show, and sorts the rest: dated rows
 * first, ascending by date, then by status, then by id. A done item is dated by its completion and any other by its
 * expected completion.
 */
export function assembleReport(items: readonly ProgressItem[], period: ReportPeriod | null): AssembledReport {
  const omitted: OmittedItem[] = [];
  const rows: ReportRow[] = [];
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
    rows.push(buildRow(item, status));
  }
  rows.sort(compareRows);

  return {
    counts: {
      done: countStatus(rows, 'done'),
      inProgress: countStatus(rows, 'in-progress'),
      planned: countStatus(rows, 'planned'),
    },
    omitted,
    period,
    rows,
  };
}

// region | Helpers

/** Returns the status of an item that the report shows, or null for one closed other than as completed. */
function assignStatus(item: ProgressItem): ProgressStatus | null {
  if (item.closed) {
    return item.completed ? 'done' : null;
  }
  return item.started ? 'in-progress' : 'planned';
}

/** Builds a row, dating a done item by its completion and any other by its expected completion. */
function buildRow(item: ProgressItem, status: ProgressStatus): ReportRow {
  const { glyph, label } = STATUS_DISPLAY[status];
  const sortDate = readSortDate(item, status);
  let date = '';
  let dateKind: ReportRow['dateKind'] = null;
  if (sortDate !== null) {
    dateKind = status === 'done' ? 'completed' : 'expected';
    date = dateKind === 'completed' ? sortDate : `Expected ${sortDate}`;
  }
  return { ...item, date, dateKind, glyph, label, status };
}

/** Orders dated rows before undated ones, then by date, status, and id. */
function compareRows(left: ReportRow, right: ReportRow): number {
  const leftDate = readSortDate(left, left.status);
  const rightDate = readSortDate(right, right.status);
  if (leftDate !== rightDate) {
    if (leftDate === null) return 1;
    if (rightDate === null) return -1;
    return leftDate < rightDate ? -1 : 1;
  }
  const byStatus = STATUS_DISPLAY[left.status].rank - STATUS_DISPLAY[right.status].rank;
  return byStatus === 0 ? ID_COLLATOR.compare(left.id, right.id) : byStatus;
}

/** Counts the rows that have `status`. */
function countStatus(rows: readonly ReportRow[], status: ProgressStatus): number {
  return rows.filter((row) => row.status === status).length;
}

/** Returns whether a completion date falls within the period; an undated completion cannot fall outside it. */
function isWithinPeriod(completedOn: string | null, period: ReportPeriod | null): boolean {
  if (period === null || completedOn === null) {
    return true;
  }
  return completedOn >= period.start && completedOn <= period.end;
}

/** Returns the date by which a row sorts. */
function readSortDate(item: ProgressItem, status: ProgressStatus): string | null {
  return status === 'done' ? item.completedOn : item.expectedOn;
}

// endregion | Helpers
