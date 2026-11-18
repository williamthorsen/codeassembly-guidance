import { describe, expect, it } from 'vitest';

import { checkLinks } from '../links.ts';

describe(checkLinks, () => {
  it('accepts an https link attached to words that leads to a public host', () => {
    expect(checkLinks('See [the release notes](https://docs.example.com/notes).', ['tracker.example'])).toStrictEqual(
      [],
    );
  });

  it.each([
    // eslint-disable-next-line unicorn/prefer-https -- the fixture is the insecure link that the check rejects.
    ['an http link', '[notes](http://docs.example.com/notes)', 'not https'],
    ['a mailto link', '[write to us](mailto:team@example.com)', 'not https'],
    ['a relative link', '[notes](/notes)', 'not an absolute URL'],
    ['a link without words', '[](https://docs.example.com)', 'attach the link to words'],
    ['an internal host', '[ticket](https://tracker.example/1)', 'internal host tracker.example'],
    ['a subdomain of an internal host', '[chat](https://team.chat.example/x)', 'internal host team.chat.example'],
  ])('rejects %s', (_label, text, reason) => {
    expect(checkLinks(text, ['tracker.example', '*.chat.example'])).toStrictEqual([
      { reason, text: expect.any(String) },
    ]);
  });

  it('rejects a bare URL and an autolink, which are not attached to words', () => {
    expect(
      checkLinks('Open https://docs.example.com or <https://docs.example.com>.', []).map(({ reason }) => reason),
    ).toStrictEqual(['attach the link to words, as [words](url)', 'attach the link to words, as [words](url)']);
  });

  it('matches an internal host without regard to case', () => {
    expect(checkLinks('[ticket](https://Tracker.Example/1)', ['TRACKER.example'])).toHaveLength(1);
  });
});
