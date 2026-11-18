/** A link in customer-facing text that the report must not publish, and why. */
export interface LinkViolation {
  reason: string;
  /** The link as written, or the bare URL. */
  text: string;
}

const INLINE_LINK = /!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Matches what remains of a URL once the inline links are removed: a scheme, an autolink, or a `www.` host. */
const BARE_URL = /<?[a-z][\d+.a-z-]*:\/\/\S+|\bwww\.\S+/gi;

/**
 * Checks every link in `text`: Each is an inline link attached to words, uses `https`, and does not lead to an
 * internal host or a subdomain of one. Returns the violations in order of appearance.
 */
export function checkLinks(text: string, internalHosts: readonly string[]): LinkViolation[] {
  const hosts = internalHosts.map(normalizeHost);
  const violations: LinkViolation[] = [];
  for (const [link, words = '', target = ''] of text.matchAll(INLINE_LINK)) {
    const reason = findLinkProblem(words, target, hosts);
    if (reason !== null) violations.push({ reason, text: link });
  }
  for (const [url] of text.replaceAll(INLINE_LINK, '').matchAll(BARE_URL)) {
    violations.push({ reason: 'attach the link to words, as [words](url)', text: url });
  }
  return violations;
}

// region | Helpers

/** Returns why an inline link may not be published, or null when it may. */
function findLinkProblem(words: string, target: string, hosts: readonly string[]): string | null {
  if (words.trim() === '') {
    return 'attach the link to words';
  }
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return 'not an absolute URL';
  }
  if (url.protocol !== 'https:') {
    return 'not https';
  }
  const hostname = url.hostname.toLowerCase();
  if (hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return `internal host ${hostname}`;
  }
  return null;
}

/** Lowercases a host and strips a leading `*.` or `.`, which name the same domain and its subdomains. */
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^\*?\./, '');
}

// endregion | Helpers
