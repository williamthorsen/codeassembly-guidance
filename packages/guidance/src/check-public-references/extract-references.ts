/**
 * Returns the distinct GitHub repositories that `text` references, as lower-case `owner/name`, sorted. A GitHub URL and
 * an `owner/name#N` reference count for any owner; a bare `owner/name` counts only when its owner is in `bareOwners`,
 * compared case-insensitively, because most bare slash pairs are paths or npm scopes. A match preceded by `@`, `/`,
 * `.`, or `-`, or followed by `/`, is part of a scope, path, or domain and does not count.
 */
export function extractReferences(text: string, bareOwners: ReadonlySet<string>): string[] {
  const owners = new Set([...bareOwners].map((owner) => owner.toLowerCase()));
  const found = new Set<string>();

  for (const match of text.matchAll(URL_PATTERN)) {
    const [, owner = '', name = ''] = match;
    if (!RESERVED_URL_OWNERS.has(owner.toLowerCase())) {
      addReference(found, owner, name);
    }
  }
  for (const match of text.matchAll(ISSUE_REFERENCE_PATTERN)) {
    const [, owner = '', name = ''] = match;
    addReference(found, owner, name);
  }
  for (const match of text.matchAll(BARE_PATTERN)) {
    const [, owner = '', name = ''] = match;
    if (owners.has(owner.toLowerCase())) {
      addReference(found, owner, name);
    }
  }

  return [...found].toSorted();
}

// region | Helpers

const OWNER = '([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)';
const NAME = '([A-Za-z0-9._-]+)';
const LEADING_BOUNDARY = String.raw`(?<![@\w./-])`;

const URL_PATTERN = new RegExp(String.raw`https?://(?:www\.)?github\.com/${OWNER}/${NAME}`, 'gi');

// A trailing `/` makes the match a path segment, not a reference.
const ISSUE_REFERENCE_PATTERN = new RegExp(String.raw`${LEADING_BOUNDARY}${OWNER}/${NAME}#\d+(?![\w/])`, 'g');

// The trailing class includes `.` so that the name cannot stop short inside `a/b.c/d`; a sentence-final `.` is
// stripped by `normalizeName`. `#` belongs to `ISSUE_REFERENCE_PATTERN`.
const BARE_PATTERN = new RegExp(String.raw`${LEADING_BOUNDARY}${OWNER}/${NAME}(?![\w/#.-])`, 'g');

// First path segments of github.com that name a site section, not an owner.
const RESERVED_URL_OWNERS = new Set([
  'about',
  'advisories',
  'apps',
  'collections',
  'contact',
  'customer-stories',
  'enterprise',
  'events',
  'explore',
  'features',
  'issues',
  'login',
  'marketplace',
  'new',
  'notifications',
  'orgs',
  'organizations',
  'pricing',
  'pulls',
  'search',
  'security',
  'settings',
  'site',
  'sponsors',
  'topics',
  'trending',
  'users',
]);

/** Adds `owner/name` to `found`, lower-cased, once its name is normalized and when it is not empty. */
function addReference(found: Set<string>, owner: string, name: string): void {
  const normalized = normalizeName(name);
  if (normalized.length > 0) {
    found.add(`${owner}/${normalized}`.toLowerCase());
  }
}

/** Strips trailing dots, which end a sentence rather than the name, and a `.git` suffix. */
function normalizeName(name: string): string {
  return name
    .replace(/\.+$/, '')
    .replace(/\.git$/i, '')
    .replace(/\.+$/, '');
}

// endregion | Helpers
