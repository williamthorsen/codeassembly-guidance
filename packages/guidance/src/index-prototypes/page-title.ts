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

/** Returns the browser title that a prototype page of the set must have. */
export function formatPrototypeTitle(setTitle: string, number: number, version: number, title: string): string {
  return `${setTitle} - ${formatId(number, version)} ${title}`;
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
  return match[1]
    .replaceAll(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replaceAll(/\s+/g, ' ')
    .trim();
}
