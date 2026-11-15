import { describe, expect, it } from 'vitest';

import { composeMessage, parseChangeEntries } from '../compose-message.ts';

describe('composeMessage', () => {
  it('separates the trimmed body from the trailers by one blank line and ends with one newline', () => {
    expect(composeMessage('Title\n\nBody.\n\n\n', ['guidance|fix: One', 'guidance|feat: Two'])).toBe(
      'Title\n\nBody.\n\nChange: guidance|fix: One\nChange: guidance|feat: Two\n',
    );
  });

  it('omits the trailer paragraph when there are no changes', () => {
    expect(composeMessage('Title\n\nBody.\n', [])).toBe('Title\n\nBody.\n');
  });
});

describe('parseChangeEntries', () => {
  it('returns each change in file order', () => {
    const text = JSON.stringify({ entries: [{ change: 'first' }, { change: 'second', extra: 1 }] });

    expect(parseChangeEntries(text)).toStrictEqual(['first', 'second']);
  });

  it.each(['', '  \n'])('returns no changes for blank text %j', (text) => {
    expect(parseChangeEntries(text)).toStrictEqual([]);
  });

  it.each([
    ['{', 'not valid JSON'],
    ['[]', 'does not contain an `entries` array'],
    ['{"entries": {}}', 'does not contain an `entries` array'],
    ['{"entries": [{"change": "ok"}, {}]}', 'entry 1 does not have'],
    ['{"entries": [{"change": " "}]}', 'entry 0 does not have'],
    ['{"entries": [{"change": 3}]}', 'entry 0 does not have'],
  ])('rejects %j', (text, message) => {
    expect(() => parseChangeEntries(text)).toThrow(message);
  });
});
