import { formatId } from './manifest.ts';

/** The entities that `readPageTitle` decodes, which are the ones that `render` and an HTML serializer emit. */
const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/** Returns the browser title of the set's index page. */
export function formatIndexTitle(setTitle: string): string {
  return `${setTitle} - Prototypes`;
}

/**
 * Returns the browser title that a prototype page of the set must have, with whitespace collapsed as `readPageTitle`
 * collapses it, so that a title flag with stray whitespace still names a title that a page can match.
 */
export function formatPrototypeTitle(setTitle: string, number: number, version: number, title: string): string {
  return collapseWhitespace(`${setTitle} - ${formatId(number, version)} ${title}`);
}

/**
 * Returns the text of the page's `<title>`, decoded and with whitespace collapsed, or `null` when the page does not
 * have one. Comments and `<svg>` elements are skipped, because a `<title>` inside an SVG is the graphic's accessible
 * name rather than the page's.
 */
export function readPageTitle(html: string): string | null {
  const stripped = html.replaceAll(/<!--[\s\S]*?-->/g, '').replaceAll(/<svg[\s>][\s\S]*?<\/svg\s*>/gi, '');
  const match = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i.exec(stripped);
  if (match?.[1] === undefined) {
    return null;
  }
  return collapseWhitespace(match[1].replaceAll(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity));
}

// region | Helpers

/** Replaces each run of whitespace with one space and trims the ends. */
function collapseWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim();
}

// endregion | Helpers
