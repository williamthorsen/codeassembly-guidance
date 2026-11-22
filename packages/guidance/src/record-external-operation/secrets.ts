// Finds secret-shaped values in text without returning the values themselves.

/** The kind of secret-shaped value that a pattern detects. */
export type SecretKind = 'high-entropy' | 'jwt' | 'known-prefix' | 'private-key' | 'url-credentials';

/** One secret-shaped value: its 1-based line, its kind, and an excerpt that does not reveal the value. */
export interface SecretMatch {
  excerpt: string;
  kind: SecretKind;
  line: number;
}

/** Returns every secret-shaped value in `text`, in line order, then in order of position within a line. */
export function findSecrets(text: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const lines = text.split(/\r?\n/);
  for (const [index, lineText] of lines.entries()) {
    matches.push(...findSecretsInLine(lineText, index + 1));
  }
  return matches;
}

// region | Helpers

/** A known credential prefix and the pattern of the value that follows it. */
interface PrefixPattern {
  prefix: string;
  suffix: string;
}

// Each suffix has a minimum length, so that a bare prefix in prose (`sk-`, `npm_`) does not match.
const PREFIX_PATTERNS: readonly PrefixPattern[] = [
  { prefix: 'sk-ant-', suffix: '[A-Za-z0-9_-]{20,}' },
  { prefix: 'sk-', suffix: '[A-Za-z0-9_-]{20,}' },
  { prefix: 'ghp_', suffix: '[A-Za-z0-9]{36}' },
  { prefix: 'gho_', suffix: '[A-Za-z0-9]{36}' },
  { prefix: 'ghs_', suffix: '[A-Za-z0-9]{36}' },
  { prefix: 'ghu_', suffix: '[A-Za-z0-9]{36}' },
  { prefix: 'github_pat_', suffix: '[A-Za-z0-9_]{22,}' },
  { prefix: 'xoxa-', suffix: '[A-Za-z0-9-]{10,}' },
  { prefix: 'xoxb-', suffix: '[A-Za-z0-9-]{10,}' },
  { prefix: 'xoxo-', suffix: '[A-Za-z0-9-]{10,}' },
  { prefix: 'xoxp-', suffix: '[A-Za-z0-9-]{10,}' },
  { prefix: 'xoxr-', suffix: '[A-Za-z0-9-]{10,}' },
  { prefix: 'xoxs-', suffix: '[A-Za-z0-9-]{10,}' },
  { prefix: 'AKIA', suffix: '[A-Z0-9]{16}' },
  { prefix: 'AIza', suffix: '[A-Za-z0-9_-]{35}' },
  { prefix: 'glpat-', suffix: '[A-Za-z0-9_-]{20,}' },
  { prefix: 'npm_', suffix: '[A-Za-z0-9]{36}' },
];

const PREFIX_REGEX = new RegExp(
  PREFIX_PATTERNS.map(({ prefix, suffix }) => `(?<![A-Za-z0-9_-])${escapeRegex(prefix)}${suffix}`).join('|'),
  'g',
);

const JWT_REGEX = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

const PRIVATE_KEY_REGEX = /-----BEGIN [A-Z ]*PRIVATE KEY-----/g;

const URL_CREDENTIALS_REGEX = /\b([a-z][a-z0-9+.-]*:\/\/)([^\s:/@]+):[^\s/@]+@/gi;

const ENTROPY_CANDIDATE_REGEX = /[A-Za-z0-9+/=_-]{32,}/g;

const URL_REGEX = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>`]+/gi;

// Random tokens of 32 or more characters score 4.7 to 5.0 bits per character; identifiers that mix cases and digits
// score about 4.1, and hex cannot exceed 4.0.
const MIN_ENTROPY_BITS = 4.5;

/** Returns the excerpt for a known-prefix match: the prefix that matched, followed by an ellipsis. */
function excerptPrefix(value: string): string {
  const pattern = PREFIX_PATTERNS.find(({ prefix }) => value.startsWith(prefix));
  return `${pattern?.prefix ?? value.slice(0, 4)}…`;
}

/** Escapes `text` for literal use in a regular expression. */
function escapeRegex(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

/** Returns the matches in one line, skipping a high-entropy candidate that overlaps a match of a specific kind. */
function findSecretsInLine(lineText: string, line: number): SecretMatch[] {
  const found: { end: number; match: SecretMatch; start: number }[] = [];

  /** Records a match of `kind` at `start` through `end`. */
  function add(kind: SecretKind, start: number, end: number, excerpt: string): void {
    found.push({ end, match: { excerpt, kind, line }, start });
  }

  for (const match of lineText.matchAll(PREFIX_REGEX)) {
    add('known-prefix', match.index, match.index + match[0].length, excerptPrefix(match[0]));
  }
  for (const match of lineText.matchAll(JWT_REGEX)) {
    add('jwt', match.index, match.index + match[0].length, 'eyJ…');
  }
  for (const match of lineText.matchAll(PRIVATE_KEY_REGEX)) {
    add('private-key', match.index, match.index + match[0].length, match[0]);
  }
  for (const match of lineText.matchAll(URL_CREDENTIALS_REGEX)) {
    add('url-credentials', match.index, match.index + match[0].length, `${match[1]}${match[2]}:…`);
  }
  const urlSpans = lineText
    .matchAll(URL_REGEX)
    .map((match) => ({ end: match.index + match[0].length, start: match.index }))
    .toArray();
  for (const match of lineText.matchAll(ENTROPY_CANDIDATE_REGEX)) {
    // Inside a URL, `/` separates path segments, so a run that spans segments is scored one segment at a time.
    const inUrl = urlSpans.some((span) => span.start <= match.index && match.index < span.end);
    const segments = inUrl ? splitOnSlash(match[0], match.index) : [{ start: match.index, text: match[0] }];
    for (const segment of segments) {
      const end = segment.start + segment.text.length;
      const overlaps = found.some((entry) => entry.start < end && segment.start < entry.end);
      if (!overlaps && segment.text.length >= 32 && isHighEntropy(segment.text)) {
        add('high-entropy', segment.start, end, `${segment.text.slice(0, 4)}…`);
      }
    }
  }

  return found.toSorted((a, b) => a.start - b.start).map((entry) => entry.match);
}

/** Returns whether `value` contains an uppercase letter, a lowercase letter, and a digit, and scores high entropy. */
function isHighEntropy(value: string): boolean {
  return /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && shannonEntropy(value) >= MIN_ENTROPY_BITS;
}

/** Returns the Shannon entropy of `value` in bits per character. */
function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

/** Returns the `/`-delimited segments of `text`, each with its offset in a line in which `text` starts at `start`. */
function splitOnSlash(text: string, start: number): { start: number; text: string }[] {
  const segments: { start: number; text: string }[] = [];
  let offset = start;
  for (const part of text.split('/')) {
    segments.push({ start: offset, text: part });
    offset += part.length + 1;
  }
  return segments;
}

// endregion | Helpers
