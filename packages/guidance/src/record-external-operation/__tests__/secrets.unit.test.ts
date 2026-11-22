import { describe, expect, it } from 'vitest';

import { findSecrets } from '../secrets.ts';
import { makeFakeToken } from '../test-utils/make-fake-token.ts';

describe('findSecrets', () => {
  it.each([
    ['sk-ant-', makeFakeToken('sk-ant-', 40)],
    ['sk-', makeFakeToken('sk-', 32)],
    ['ghp_', makeFakeToken('ghp_', 36)],
    ['github_pat_', makeFakeToken('github_pat_', 30)],
    ['xoxb-', makeFakeToken('xoxb-', 24)],
    ['AKIA', makeFakeToken('AKIA', 16, 'upper')],
    ['AIza', makeFakeToken('AIza', 35)],
    ['glpat-', makeFakeToken('glpat-', 20)],
    ['npm_', makeFakeToken('npm_', 36)],
  ])('flags a %s token and shows only its prefix', (prefix, token) => {
    const matches = findSecrets(`- **Credentials:** ${token} in Vercel`);

    expect(matches).toEqual([{ excerpt: `${prefix}…`, kind: 'known-prefix', line: 1 }]);
  });

  it('flags a JWT', () => {
    const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', makeFakeToken('', 43)].join('.');

    expect(findSecrets(`token: ${jwt}`)).toEqual([{ excerpt: 'eyJ…', kind: 'jwt', line: 1 }]);
  });

  it('flags a private-key block by its header line', () => {
    const header = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ');

    expect(findSecrets(`${header}\nMIIEow...`)).toEqual([{ excerpt: header, kind: 'private-key', line: 1 }]);
  });

  it('flags a URL with embedded credentials without showing the password', () => {
    const matches = findSecrets('Connect with redis://default:hunter2pass@us1-fast-cat.example.io:6379');

    expect(matches).toEqual([{ excerpt: 'redis://default:…', kind: 'url-credentials', line: 1 }]);
  });

  it('flags a high-entropy token and shows only its first four characters', () => {
    const token = makeFakeToken('', 32);

    expect(findSecrets(`value ${token}`)).toEqual([
      { excerpt: `${token.slice(0, 4)}…`, kind: 'high-entropy', line: 1 },
    ]);
  });

  it('flags a high-entropy token in a URL path segment', () => {
    const token = makeFakeToken('', 40);

    expect(findSecrets(`https://hooks.example.com/services/${token}/notify`)).toEqual([
      { excerpt: `${token.slice(0, 4)}…`, kind: 'high-entropy', line: 1 },
    ]);
  });

  it('reports a match once, under its specific kind, when the high-entropy pattern also covers it', () => {
    const token = makeFakeToken('sk-', 40);

    expect(findSecrets(token)).toEqual([{ excerpt: 'sk-…', kind: 'known-prefix', line: 1 }]);
  });

  it('reports the line of each match', () => {
    const text = ['# Vercel', '', `- a: ${makeFakeToken('sk-', 30)}`, `- b: ${makeFakeToken('npm_', 36)}`].join('\n');

    expect(findSecrets(text).map((match) => match.line)).toEqual([3, 4]);
  });

  it.each([
    ['ordinary prose', 'Created the project and set the production variables through the dashboard.'],
    ['a bare prefix in prose', 'Keys that start with sk- or npm_ belong in the vault.'],
    ['a variable name', '`REDIS_REST_TOKEN_FOR_PRODUCTION_DEPLOYMENTS` in Vercel (production)'],
    ['a URL without credentials', 'https://vercel.com/my-team/my-project/settings/environment-variables'],
    [
      'a permalink with a SHA and mixed-case path segments',
      'https://github.com/acme/storefront/blob/5cd80ea1f3b2c4d5e6f7a8b9c0d1e2f3a4b5c6d7/apps/WebApp/src/Config.ts',
    ],
    ['a UUID', 'Database ID: 3f2b8c1e-9a4d-4e7f-b6c5-1d2e3f4a5b6c'],
    ['a git SHA', 'Commit 5cd80ea1f3b2c4d5e6f7a8b9c0d1e2f3a4b5c6d7'],
    ['a 32-character hex ID', 'Account ID 9f86d081884c7d659a2feaa0c55ad015'],
    ['a project name', 'Project `MyCompanyStagingEnvironment2025Primary`'],
    ['a region code', 'Region: us-east-1, eu-west-2'],
  ])('passes %s', (_label, text) => {
    expect(findSecrets(text)).toEqual([]);
  });
});
