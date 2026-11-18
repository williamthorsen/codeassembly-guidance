import type { ProgressStatus } from './assemble.ts';
import { checkLinks } from './links.ts';
import type { AssembledResult, Health, ReportTextFile } from './schemas.ts';

/** The formats in which `render` writes a report. */
export const REPORT_FORMATS = ['markdown'] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];

/** One row of a rendered report. */
export interface MergedRow {
  date: string;
  dateOn: string | null;
  details: string;
  label: string;
  status: ProgressStatus;
  /** The row's place in the text file, such as `sections.0.rows.2`. */
  where: string;
  workItem: string;
}

/** One section of a rendered report. */
export interface MergedSection {
  heading: string;
  health: Health;
  note: string | null;
  rows: MergedRow[];
  /** The section's place in the text file, such as `sections.0`. */
  where: string;
}

/** A report whose text and facts are merged and whose links are checked. */
export interface MergedReport {
  lastUpdated: string;
  period: AssembledResult['period'];
  sections: MergedSection[];
}

/** A report that cannot be rendered: each problem with the place in the text file where it was found. */
export class RenderError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(problems.join('; '));
  }
}

const HEALTH_DISPLAY: Readonly<Record<Health, string>> = {
  'at-risk': '🟠 At risk',
  'off-track': '🔴 Off track',
  'on-track': '🟢 On track',
};

/** The writer of each format. */
const RENDERERS: Readonly<Record<ReportFormat, (report: MergedReport) => string>> = { markdown: renderMarkdown };

const STATUS_GLYPH: Readonly<Record<ProgressStatus, string>> = {
  done: '✅',
  'in-progress': '🔄',
  'needs-input': '🙋',
  planned: '🗓️',
};

/**
 * Merges the agent's text with the assembled report and renders it. Statuses and dates come from the assembled report
 * alone; the text supplies every word that the customer reads, and every link in it must pass `checkLinks`.
 */
export function renderReport(
  assembled: AssembledResult,
  text: ReportTextFile,
  format: ReportFormat,
  internalHosts: readonly string[],
): string {
  return RENDERERS[format](mergeReport(assembled, text, internalHosts));
}

// region | Helpers

/** Joins the text to the assembled sections and rows one to one, collecting every mismatch and link violation. */
function mergeReport(assembled: AssembledResult, text: ReportTextFile, internalHosts: readonly string[]): MergedReport {
  const problems: string[] = [];
  const textSections = indexUnique(
    text.sections,
    (section) => section.workstream,
    (index, firstIndex, id) => `sections.${index}: repeats the section ${describeId(id)} of sections.${firstIndex}`,
    problems,
  );
  const assembledIds = new Set(assembled.sections.map(({ workstream }) => workstream?.id ?? null));
  for (const [id, { index }] of textSections) {
    if (!assembledIds.has(id)) problems.push(`sections.${index}: the report does not have a section ${describeId(id)}`);
  }

  const sections: MergedSection[] = [];
  for (const assembledSection of assembled.sections) {
    const id = assembledSection.workstream?.id ?? null;
    const found = textSections.get(id);
    if (found === undefined) {
      problems.push(`sections: the text does not have the section ${describeId(id)}`);
      continue;
    }
    sections.push(mergeSection(assembledSection, found.entry, `sections.${found.index}`, internalHosts, problems));
  }

  if (problems.length > 0) throw new RenderError(problems);
  return { lastUpdated: assembled.lastUpdated, period: assembled.period, sections };
}

/** Joins one section's text to its assembled rows, adding a problem for each mismatch and link violation. */
function mergeSection(
  { rows, workstream }: AssembledResult['sections'][number],
  section: ReportTextFile['sections'][number],
  where: string,
  internalHosts: readonly string[],
  problems: string[],
): MergedSection {
  const declared = workstream?.health;
  if (section.health === undefined && declared === undefined) {
    problems.push(`${where}.health: required, because the source does not declare the workstream's health`);
  } else if (section.health !== undefined && declared !== undefined && section.health !== declared) {
    problems.push(`${where}.health: "${section.health}" contradicts the declared "${declared}"`);
  }
  const note = section.note ?? workstream?.note ?? null;
  collectLinkProblems(`${where}.heading`, section.heading, internalHosts, problems);
  if (note !== null) collectLinkProblems(`${where}.note`, note, internalHosts, problems);

  const rowTexts = indexUnique(
    section.rows,
    (row) => row.id,
    (index, firstIndex, rowId) => `${where}.rows.${index}: repeats the item ${rowId} of ${where}.rows.${firstIndex}`,
    problems,
  );
  for (const [rowId, { index: rowIndex }] of rowTexts) {
    if (rows.every((row) => row.id !== rowId)) {
      problems.push(`${where}.rows.${rowIndex}: the section does not have the item ${rowId}`);
    }
  }
  const mergedRows: MergedRow[] = [];
  for (const row of rows) {
    const rowText = rowTexts.get(row.id);
    if (rowText === undefined) {
      problems.push(`${where}.rows: the text does not have the item ${row.id}`);
      continue;
    }
    const rowWhere = `${where}.rows.${rowText.index}`;
    collectLinkProblems(`${rowWhere}.workItem`, rowText.entry.workItem, internalHosts, problems);
    collectLinkProblems(`${rowWhere}.details`, rowText.entry.details, internalHosts, problems);
    mergedRows.push({
      ...rowText.entry,
      date: row.date,
      dateOn: row.dateOn,
      label: row.label,
      status: row.status,
      where: rowWhere,
    });
  }
  // A missing health has already added a problem, so the fallback never reaches a rendered report.
  return {
    heading: section.heading,
    health: section.health ?? declared ?? 'on-track',
    note,
    rows: mergedRows,
    where,
  };
}

/** Adds a problem for each link in `text` that the report may not publish. */
function collectLinkProblems(where: string, text: string, internalHosts: readonly string[], problems: string[]): void {
  for (const { reason, text: link } of checkLinks(text, internalHosts)) {
    problems.push(`${where}: ${link}: ${reason}`);
  }
}

/** Indexes entries by key, keeping the first of each and adding a problem for every repeat. */
function indexUnique<Key, Entry>(
  entries: readonly Entry[],
  readKey: (entry: Entry) => Key,
  describeRepeat: (index: number, firstIndex: number, key: Key) => string,
  problems: string[],
): Map<Key, { entry: Entry; index: number }> {
  const indexed = new Map<Key, { entry: Entry; index: number }>();
  for (const [index, entry] of entries.entries()) {
    const key = readKey(entry);
    const first = indexed.get(key);
    if (first === undefined) {
      indexed.set(key, { entry, index });
    } else {
      problems.push(describeRepeat(index, first.index, key));
    }
  }
  return indexed;
}

/** Names a section by its workstream id. */
function describeId(id: string | null): string {
  return id === null ? 'for the items without a workstream' : `for the workstream ${id}`;
}

/** Renders the report as Markdown: the update line, then each section's heading, health, and table. */
function renderMarkdown(report: MergedReport): string {
  const updated =
    report.period === null
      ? `Last updated ${report.lastUpdated}`
      : `Last updated ${report.lastUpdated} · Reporting period ${report.period.start} to ${report.period.end}`;
  const blocks = [updated];
  for (const section of report.sections) {
    const health = HEALTH_DISPLAY[section.health];
    blocks.push(
      `## ${section.heading}`,
      `**Health:** ${section.note === null ? health : `${health}: ${section.note}`}`,
      [
        '| Work item | Status | Date | Details |',
        '| --- | --- | --- | --- |',
        ...section.rows.map((row) =>
          [
            '',
            escapeCell(row.workItem),
            `${STATUS_GLYPH[row.status]} ${row.label}`,
            row.date,
            renderCell(row.details),
            '',
          ]
            .join(' | ')
            .trim(),
        ),
      ].join('\n'),
    );
  }
  return `${blocks.join('\n\n')}\n`;
}

const LIST_ITEM = /^\s*([*+-]|\d+[.)])\s+/;

/**
 * Renders Markdown of paragraphs and lists as one table cell: paragraphs joined by `<br><br>`, and each list as `<ul>`
 * or `<ol>`, because a Markdown table cell cannot hold a line break.
 */
function renderCell(markdown: string): string {
  const parts: { html: string; isList: boolean }[] = [];
  for (const block of markdown.trim().split(/\n\s*\n/)) {
    const lines = block.split('\n').map((line) => line.trim());
    const listStart = lines.findIndex((line) => LIST_ITEM.test(line));
    const textLines = listStart === -1 ? lines : lines.slice(0, listStart);
    if (textLines.length > 0) parts.push({ html: escapeCell(textLines.join(' ')), isList: false });
    if (listStart !== -1) parts.push({ html: renderList(lines.slice(listStart)), isList: true });
  }
  return parts
    .map((part, index) => {
      const previous = parts[index - 1];
      const separator = previous === undefined || previous.isList || part.isList ? '' : '<br><br>';
      return `${separator}${part.html}`;
    })
    .join('');
}

/** Renders the lines of one list block, joining a continuation line to the item before it. */
function renderList(lines: readonly string[]): string {
  const ordered = /^\d/.test(lines[0] ?? '');
  const items: string[] = [];
  for (const line of lines) {
    if (LIST_ITEM.test(line)) {
      items.push(line.replace(LIST_ITEM, ''));
    } else {
      items[items.length - 1] = `${items.at(-1) ?? ''} ${line}`;
    }
  }
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items.map((item) => `<li>${escapeCell(item)}</li>`).join('')}</${tag}>`;
}

/** Escapes the pipes that would end a table cell. */
function escapeCell(text: string): string {
  return text.replaceAll('|', String.raw`\|`);
}

// endregion | Helpers
