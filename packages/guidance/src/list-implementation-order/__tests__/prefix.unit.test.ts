import { describe, expect, it } from 'vitest';

import { derivePrefixes } from '../prefix.ts';

describe(derivePrefixes, () => {
  it.each([
    { repository: 'acme/codeassembly-guidance', prefix: 'CG' },
    { repository: 'acme/node-monorepo-tools', prefix: 'NMT' },
    { repository: 'acme/configs.macos', prefix: 'CM' },
    { repository: 'acme/toolbelt', prefix: 'TO' },
  ])('derives $prefix from the segments of $repository', ({ repository, prefix }) => {
    expect(derivePrefixes([repository]).get(repository)).toBe(prefix);
  });

  it('lengthens only the names whose initials collide, by letters of the last segment', () => {
    const prefixes = derivePrefixes(['acme/top-right', 'acme/team-reimagined', 'acme/toolbelt']);

    expect(Object.fromEntries(prefixes)).toEqual({
      'acme/team-reimagined': 'TRE',
      'acme/toolbelt': 'TO',
      'acme/top-right': 'TRI',
    });
  });

  it('uses the whole name when the last segment runs out before the prefixes differ', () => {
    const prefixes = derivePrefixes(['acme/a-bc', 'acme/ab-bc']);

    expect(new Set(prefixes.values())).toEqual(new Set(['A-BC', 'AB-BC']));
  });

  it('puts a letter of the owner in front when two owners have a repository of the same name', () => {
    const prefixes = derivePrefixes(['acme/site-tools', 'beta/site-tools']);

    expect(Object.fromEntries(prefixes)).toEqual({ 'acme/site-tools': 'AST', 'beta/site-tools': 'BST' });
  });

  it('gives each repository a distinct prefix when an owner letter makes one prefix equal another', () => {
    const repositories = ['acme/site-tools', 'beta/site-tools', 'acme/a-s-t'];

    const prefixes = derivePrefixes(repositories);

    expect(new Set(prefixes.values()).size).toBe(repositories.length);
  });

  it('gives one prefix to two spellings of a repository that differ only in case', () => {
    const prefixes = derivePrefixes(['acme/Site-Tools', 'acme/site-tools']);

    expect(Object.fromEntries(prefixes)).toEqual({ 'acme/Site-Tools': 'ST', 'acme/site-tools': 'ST' });
  });
});
