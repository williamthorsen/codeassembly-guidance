import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { listUnsearchedPrivateStores } from '../list-unsearched-private-stores.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const STORES = join(FIXTURES, 'visibility-registry', 'stores');

const REGISTERED = [
  { name: 'invalid-config-vault', path: join(FIXTURES, 'invalid-config-vault') },
  { name: 'missing-vault', path: join(STORES, 'missing-vault') },
  { name: 'no-config-vault', path: join(STORES, 'no-config-vault') },
  { name: 'private-vault', path: join(STORES, 'private-vault') },
  { name: 'shared-vault', path: join(STORES, 'shared-vault') },
  { name: 'undeclared-vault', path: join(STORES, 'undeclared-vault') },
];

describe(listUnsearchedPrivateStores, () => {
  let linkDir: string | undefined;

  afterEach(async () => {
    if (linkDir !== undefined) {
      await rm(linkDir, { recursive: true, force: true });
      linkDir = undefined;
    }
  });

  it('lists every unsearched store that is private or whose config cannot be read, and omits the shared store', async () => {
    const result = await listUnsearchedPrivateStores({ registeredStores: REGISTERED, searchedPaths: [] });

    expect(result.map((store) => store.name)).toEqual([
      'invalid-config-vault',
      'missing-vault',
      'no-config-vault',
      'private-vault',
      'undeclared-vault',
    ]);
  });

  it('omits a searched store', async () => {
    const result = await listUnsearchedPrivateStores({
      registeredStores: REGISTERED,
      searchedPaths: [join(STORES, 'private-vault'), join(STORES, 'undeclared-vault')],
    });

    expect(result.map((store) => store.name)).toEqual(['invalid-config-vault', 'missing-vault', 'no-config-vault']);
  });

  it('treats a store searched through a symlink as searched', async () => {
    linkDir = await mkdtemp(join(tmpdir(), 'unsearched-'));
    const linkPath = join(linkDir, 'private-link');
    await symlink(join(STORES, 'private-vault'), linkPath);

    const result = await listUnsearchedPrivateStores({
      registeredStores: [{ name: 'private-vault', path: join(STORES, 'private-vault') }],
      searchedPaths: [linkPath],
    });

    expect(result).toEqual([]);
  });
});
