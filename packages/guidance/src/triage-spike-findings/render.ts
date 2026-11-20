/** Renders the dispositions comment and the per-issue comments from a dispositions record. */
import { renderEvidenceBlock } from './evidence.ts';
import { orderItems } from './order.ts';
import { type DispositionsRecord, hasTicketItem, type IssueReference, type Item } from './schemas.ts';

/** The text that stands in for a ticket that step 7 has not yet created. */
export const PENDING = '(pending)';

/** Renders an issue reference in its platform's form: `#N` for a GitHub number, the key itself for a Jira key. */
export function formatReference(reference: IssueReference): string {
  return typeof reference === 'number' ? `#${reference}` : reference;
}

/**
 * Renders the comment that the skill posts on the triage ticket: the table in display order, the challenge, the notes,
 * and the evidence block when any item has evidence. Only a GitHub record names an umbrella.
 */
export function renderDispositionsComment(record: DispositionsRecord): string {
  const umbrella = record.umbrella === null ? PENDING : formatReference(record.umbrella);
  const hasUmbrella = record.platform === 'github' && hasTicketItem(record);
  const umbrellaSentence = hasUmbrella ? ` The umbrella for the new tickets is ${umbrella}.` : '';
  const lines = [
    `## Dispositions of the findings of ${record.source}`,
    '',
    `Every item that the findings left undisposed, with its disposition and grades. Confidence grades advisability: \`high\` is clearly worth doing, \`medium\` is worth doing but arguable, \`low\` is not worth a ticket now. Value grades how much the item matters.${umbrellaSentence}`,
    '',
    '| Item | Disposition | Confidence | Value | Where | Blocked by | Reason |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...orderItems(record).map((item) => renderRow(item, record)),
    '',
    '## Challenge',
    '',
    record.challengeSummary.trim(),
  ];
  if (record.notes.length > 0) {
    const heading = record.platform === 'github' ? '## Labels and follow-ups' : '## Follow-ups';
    lines.push('', heading, '', ...record.notes.map((note) => `- ${note}`));
  }
  const evidenceBlock = renderEvidenceBlock(record);
  if (evidenceBlock !== undefined) lines.push('', evidenceBlock);
  return `${lines.join('\n')}\n`;
}

/** Renders one comment per issue that a `comment` disposition names, grouping the items that name one issue. */
export function renderIssueComments(record: DispositionsRecord): Map<IssueReference, string> {
  const grouped = new Map<IssueReference, Item[]>();
  for (const item of record.items) {
    if (item.disposition !== 'comment' || item.target === null) continue;
    grouped.set(item.target, [...(grouped.get(item.target) ?? []), item]);
  }
  const comments = new Map<IssueReference, string>();
  for (const [issue, items] of grouped) {
    const triageTicket = formatReference(record.triageTicket);
    const lines = [
      `A triage of the findings of ${record.source} (${triageTicket}) assigns the following to this issue:`,
      '',
      ...items.map(
        (item) => `- **${item.title}** (confidence ${item.confidence}, value ${item.value}): ${item.reason}`,
      ),
    ];
    comments.set(issue, `${lines.join('\n')}\n`);
  }
  return comments;
}

// region | Helpers

/** Escapes the characters that would break a Markdown table cell. */
function escapeCell(text: string): string {
  return text
    .replaceAll('|', String.raw`\|`)
    .replaceAll(/\r?\n/g, ' ')
    .trim();
}

/** Renders a `ticket` item's blockers as issue references, with a placeholder for a blocker not yet created. */
function renderBlockedBy(item: Item, record: DispositionsRecord): string {
  if (item.disposition !== 'ticket') return '';
  return (item.blockedBy ?? [])
    .map((entry) => {
      const blocker = record.items.find((candidate) => candidate.id === entry);
      if (blocker === undefined) return formatReference(entry);
      return blocker.ticket === null ? PENDING : formatReference(blocker.ticket);
    })
    .join(', ');
}

/** Renders one item's table row. */
function renderRow(item: Item, record: DispositionsRecord): string {
  const cells = [
    `${item.id} ${item.title}`,
    item.disposition,
    item.confidence,
    item.value,
    renderWhere(item),
    renderBlockedBy(item, record),
    item.reason,
  ];
  return `| ${cells.map((cell) => escapeCell(cell)).join(' | ')} |`;
}

/** Renders the where column: the ticket for a `ticket` or `comment` item, the target for a `merge`, empty for a `drop`. */
function renderWhere(item: Item): string {
  switch (item.disposition) {
    case 'comment':
      return item.target === null ? '' : formatReference(item.target);
    case 'merge':
      return `merged into ${String(item.target)}`;
    case 'ticket':
      return item.ticket === null ? PENDING : formatReference(item.ticket);
    default:
      return '';
  }
}

// endregion | Helpers
