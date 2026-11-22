import { describe, expect, it } from 'vitest';

import { extractReferences } from '../extract-references.ts';

const OWNERS = new Set(['acme']);

describe(extractReferences, () => {
  it.each([
    { text: 'See https://github.com/other/widgets for details.', expected: ['other/widgets'] },
    { text: 'See https://www.github.com/other/widgets/issues/4.', expected: ['other/widgets'] },
    { text: 'Clone http://github.com/other/widgets.git first', expected: ['other/widgets'] },
    { text: 'Fixed in other/widgets#12.', expected: ['other/widgets'] },
    { text: 'Depends on (other/widgets#12)', expected: ['other/widgets'] },
    { text: 'The acme/widgets repository', expected: ['acme/widgets'] },
    { text: 'Ends with acme/widgets.', expected: ['acme/widgets'] },
    { text: 'Quoted "acme/widgets", then `acme/core.lib`', expected: ['acme/core.lib', 'acme/widgets'] },
  ])('extracts the reference in "$text"', ({ text, expected }) => {
    expect(extractReferences(text, OWNERS)).toStrictEqual(expected);
  });

  it.each([
    { text: 'Install @acme/widgets', reason: 'an npm scope' },
    { text: 'Edit packages/acme/widgets', reason: 'a longer path' },
    { text: 'Edit acme/widgets/src/index.ts', reason: 'a path with a trailing segment' },
    { text: 'Visit example.com/acme/widgets', reason: 'a path under a domain' },
    { text: 'The other/widgets repository', reason: 'a bare owner outside the set' },
    { text: 'Open acme/widgets#3/files', reason: 'an issue reference followed by a path' },
    { text: 'See https://github.com/advisories/GHSA-g3hv-75wg-m249', reason: 'a reserved site section' },
    { text: 'Edit my-acme/widgets', reason: 'a hyphenated prefix of the owner' },
  ])('ignores $reason', ({ text }) => {
    expect(extractReferences(text, OWNERS)).toStrictEqual([]);
  });

  it('collapses references that differ only in case', () => {
    const text = 'Acme/Widgets and acme/widgets#2 and https://github.com/ACME/widgets';

    expect(extractReferences(text, OWNERS)).toStrictEqual(['acme/widgets']);
  });

  it('compares bare owners with the set case-insensitively', () => {
    expect(extractReferences('The Acme/widgets repository', new Set(['ACME']))).toStrictEqual(['acme/widgets']);
  });

  it('extracts references inside code fences', () => {
    const text = 'Run:\n\n```sh\ngh issue view other/widgets#9\n```\n';

    expect(extractReferences(text, OWNERS)).toStrictEqual(['other/widgets']);
  });
});
