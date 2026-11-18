import { Lexer, type Token, type Tokens } from 'marked';

import { formatDateCell, type ProgressStatus } from './assemble.ts';
import type { MergedReport, MergedRow, MergedSection } from './render.ts';
import { RenderError } from './RenderError.ts';
import type { Health } from './schemas.ts';

/** A status-macro colour that Confluence offers. */
type LozengeColour = 'Blue' | 'Green' | 'Grey' | 'Red' | 'Yellow';

const HEALTH_LOZENGE: Readonly<Record<Health, { colour: LozengeColour; title: string }>> = {
  'at-risk': { colour: 'Yellow', title: 'At risk' },
  'off-track': { colour: 'Red', title: 'Off track' },
  'on-track': { colour: 'Green', title: 'On track' },
};

const STATUS_COLOUR: Readonly<Record<ProgressStatus, LozengeColour>> = {
  done: 'Green',
  'in-progress': 'Blue',
  'needs-input': 'Yellow',
  planned: 'Grey',
};

/**
 * Renders the report in Confluence storage format: the update line, then each section's heading, health, and table,
 * with health and statuses as status lozenges and dates as `<time>` elements. Throws a `RenderError` naming every
 * place whose Markdown the format cannot render.
 */
export function renderConfluence(report: MergedReport): string {
  const problems: string[] = [];
  const lastUpdated = `Last updated ${renderTime(report.lastUpdated)}`;
  const updated =
    report.period === null
      ? lastUpdated
      : `${lastUpdated} · Reporting period ${renderTime(report.period.start)} to ${renderTime(report.period.end)}`;
  const blocks = [`<p>${updated}</p>`, ...report.sections.map((section) => renderSection(section, problems))];
  if (problems.length > 0) throw new RenderError(problems);
  return `${blocks.join('\n')}\n`;
}

// region | Helpers

/** Names an unsupported construct by its place, its token type, and the first line of its Markdown. */
function describeUnsupported(token: Token, where: string): string {
  const firstLine = token.raw.trim().split('\n', 1)[0] ?? '';
  return `${where}: unsupported Markdown ${token.type}: ${firstLine}`;
}

/** Escapes the characters that XML text and attribute values cannot hold as written. */
function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/** Returns whether a token is a link. */
function isLink(token: Token): token is Tokens.Link {
  return token.type === 'link';
}

/** Returns whether a token is a list. */
function isList(token: Token): token is Tokens.List {
  return token.type === 'list';
}

/** Returns the inline children of a token, or none. */
function readChildren(token: Token): Token[] {
  return 'tokens' in token && Array.isArray(token.tokens) ? token.tokens : [];
}

/** Returns a token's text, or the empty string for a token without one. */
function readText(token: Token): string {
  return 'text' in token && typeof token.text === 'string' ? token.text : '';
}

/** Converts Markdown of paragraphs and lists to storage-format blocks, adding a problem for each other construct. */
function renderBlocks(markdown: string, where: string, problems: string[]): string {
  return renderBlockTokens(Lexer.lex(markdown), false, where, problems);
}

/** Renders block tokens, writing a paragraph's text inline rather than as a `<p>` when `isTightItem` is set. */
function renderBlockTokens(tokens: readonly Token[], isTightItem: boolean, where: string, problems: string[]): string {
  return tokens
    .map((token) => {
      if (isList(token)) return renderList(token, where, problems);
      if (token.type === 'space') return '';
      if (token.type !== 'paragraph' && token.type !== 'text') {
        problems.push(describeUnsupported(token, where));
        return '';
      }
      const inline = renderInlineTokens(readChildren(token), where, problems);
      return isTightItem ? inline : `<p>${inline}</p>`;
    })
    .join('');
}

/** Converts Markdown to inline storage-format content, adding a problem for each block construct but one paragraph. */
function renderInline(markdown: string, where: string, problems: string[]): string {
  const [first, ...rest] = Lexer.lex(markdown).filter((token) => token.type !== 'space');
  for (const token of rest) problems.push(describeUnsupported(token, where));
  if (first === undefined) return '';
  if (first.type !== 'paragraph') {
    problems.push(describeUnsupported(first, where));
    return '';
  }
  return renderInlineTokens(readChildren(first), where, problems);
}

/** Renders inline tokens, writing raw HTML as literal text and a soft line break as a space. */
function renderInlineTokens(tokens: readonly Token[], where: string, problems: string[]): string {
  return tokens
    .map((token) => {
      if (isLink(token)) {
        return `<a href="${escapeXml(token.href)}">${renderInlineTokens(token.tokens, where, problems)}</a>`;
      }
      switch (token.type) {
        case 'br':
          return '<br />';
        case 'codespan':
          return `<code>${escapeXml(readText(token))}</code>`;
        case 'em':
        case 'strong':
          return `<${token.type}>${renderInlineTokens(readChildren(token), where, problems)}</${token.type}>`;
        case 'escape':
        case 'html':
          return escapeXml(readText(token));
        case 'text': {
          const children = readChildren(token);
          return children.length > 0
            ? renderInlineTokens(children, where, problems)
            : escapeXml(readText(token).replaceAll(/\s*\n\s*/g, ' '));
        }
        default:
          problems.push(describeUnsupported(token, where));
          return '';
      }
    })
    .join('');
}

/** Renders a list, writing each tight item's text inline and each loose item's paragraphs as `<p>`. */
function renderList(list: Tokens.List, where: string, problems: string[]): string {
  const tag = list.ordered ? 'ol' : 'ul';
  const start = typeof list.start === 'number' && list.start !== 1 ? ` start="${list.start}"` : '';
  const items = list.items.map((item) => `<li>${renderBlockTokens(item.tokens, !item.loose, where, problems)}</li>`);
  return `<${tag}${start}>${items.join('')}</${tag}>`;
}

/** Renders a status lozenge. */
function renderLozenge(colour: LozengeColour, title: string): string {
  return [
    '<ac:structured-macro ac:name="status">',
    `<ac:parameter ac:name="colour">${colour}</ac:parameter>`,
    `<ac:parameter ac:name="title">${escapeXml(title)}</ac:parameter>`,
    '</ac:structured-macro>',
  ].join('');
}

/** Renders one table row: the work item, the status lozenge, the date cell, and the details. */
function renderRow(row: MergedRow, problems: string[]): string {
  const cells = [
    renderInline(row.workItem, `${row.where}.workItem`, problems),
    renderLozenge(STATUS_COLOUR[row.status], row.label),
    formatDateCell(row.status, row.dateOn, renderTime),
    renderBlocks(row.details, `${row.where}.details`, problems),
  ];
  return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
}

/** Renders one section: its heading, its health with the note, and its table. */
function renderSection(section: MergedSection, problems: string[]): string {
  const { colour, title } = HEALTH_LOZENGE[section.health];
  const note = section.note === null ? '' : ` ${renderInline(section.note, `${section.where}.note`, problems)}`;
  const header = ['Work item', 'Status', 'Date', 'Details'].map((label) => `<th>${label}</th>`).join('');
  const rows = section.rows.map((row) => renderRow(row, problems)).join('');
  return [
    `<h2>${renderInline(section.heading, `${section.where}.heading`, problems)}</h2>`,
    `<p><strong>Health:</strong> ${renderLozenge(colour, title)}${note}</p>`,
    `<table><tbody><tr>${header}</tr>${rows}</tbody></table>`,
  ].join('\n');
}

/** Renders a `YYYY-MM-DD` date as a date element, which Confluence shows in the reader's locale. */
function renderTime(date: string): string {
  return `<time datetime="${escapeXml(date)}" />`;
}

// endregion | Helpers
