import { describe, expect, it } from 'vitest';

import { formatIndexTitle, formatPrototypeTitle, readPageTitle } from '../page-title.ts';

describe(formatPrototypeTitle, () => {
  it('names the set, the id, and the prototype', () => {
    expect(formatPrototypeTitle('Top Right', 1, 1, 'Next item')).toBe('Top Right - 1.1 Next item');
  });
});

describe(formatIndexTitle, () => {
  it('names the set and the index', () => {
    expect(formatIndexTitle('Top Right')).toBe('Top Right - Prototypes');
  });
});

describe(readPageTitle, () => {
  it('reads the title text', () => {
    expect(readPageTitle('<title>Top Right - 1.1 Next item</title><style></style>')).toBe('Top Right - 1.1 Next item');
  });

  it('decodes entities and collapses whitespace', () => {
    expect(readPageTitle('<title>\n  Tom &amp; Jerry -\n  2.1 &quot;Dense&quot;\n</title>')).toBe(
      'Tom & Jerry - 2.1 "Dense"',
    );
  });

  it('matches the element case-insensitively and with attributes', () => {
    expect(readPageTitle('<TITLE lang="en">Top Right - 1.1 Next item</TITLE>')).toBe('Top Right - 1.1 Next item');
  });

  it('skips a title inside an svg and inside a comment', () => {
    const html = [
      '<!-- <title>Old</title> -->',
      '<svg viewBox="0 0 1 1"><title>Chart</title></svg>',
      '<title>Top Right - 1.1 Next item</title>',
    ].join('\n');

    expect(readPageTitle(html)).toBe('Top Right - 1.1 Next item');
  });

  it('returns null for a page without a title', () => {
    expect(readPageTitle('<main><h1>Top Right</h1></main>')).toBeNull();
  });
});
