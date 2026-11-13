import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveScope } from '../scope.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const PROJECT_KB = join(FIXTURES, 'project-kb');
const VAULT_A = join(FIXTURES, 'vault-a');
const VAULT_B = join(FIXTURES, 'vault-b');
const NOTES_VAULT = join(FIXTURES, 'notes-vault');
const MALFORMED_REGISTRY = join(FIXTURES, 'registry.malformed');
const OPT_IN_REGISTRY = join(FIXTURES, 'opt-in-registry');
const HOME_WITH_DEFAULT = join(FIXTURES, 'home-with-default');
const VISIBILITY_REGISTRY = join(FIXTURES, 'visibility-registry');
// A home directory without a `.agents/kb.yaml`, so the user-global registry is empty.
const HOME_EMPTY = FIXTURES;

describe(resolveScope, () => {
  it('default scope is the discovered KB plus the registry default', async () => {
    const { kbs, registryError } = await resolveScope({ startDir: PROJECT_KB, allKbs: false, home: HOME_EMPTY });

    expect(kbs).toEqual([
      { name: null, path: PROJECT_KB, via: 'discovery' },
      { name: 'vault-a', path: VAULT_A, via: 'registry-default' },
    ]);
    expect(registryError).toBeUndefined();
  });

  it('--all-kbs widens scope to every registered KB', async () => {
    const { kbs } = await resolveScope({ startDir: PROJECT_KB, allKbs: true, home: HOME_EMPTY });

    expect(kbs).toEqual([
      { name: null, path: PROJECT_KB, via: 'discovery' },
      { name: 'vault-a', path: VAULT_A, via: 'registry-all' },
      { name: 'vault-b', path: VAULT_B, via: 'registry-all' },
    ]);
  });

  it('adds each entry that opts into default scope once, keeping the provenance of discovery and default_kb', async () => {
    const { kbs } = await resolveScope({ startDir: OPT_IN_REGISTRY, allKbs: false, home: HOME_EMPTY });

    // `notes-vault` declares `in_default_scope: false`, so the exact list also asserts that it stays out.
    expect(kbs).toEqual([
      { name: null, path: OPT_IN_REGISTRY, via: 'discovery' },
      { name: 'vault-a', path: VAULT_A, via: 'registry-default' },
      { name: 'vault-b', path: VAULT_B, via: 'registry-in-default-scope' },
    ]);
  });

  it('returns only the discovered KB when neither the project nor the home directory configures a registry', async () => {
    const { kbs } = await resolveScope({ startDir: NOTES_VAULT, allKbs: false, home: HOME_EMPTY });

    expect(kbs).toEqual([{ name: null, path: NOTES_VAULT, via: 'discovery' }]);
  });

  it('reads the user-global registry when the project does not have a registry', async () => {
    const { kbs } = await resolveScope({ startDir: NOTES_VAULT, allKbs: false, home: HOME_WITH_DEFAULT });

    expect(kbs).toEqual([
      { name: null, path: NOTES_VAULT, via: 'discovery' },
      { name: 'global-vault', path: VAULT_B, via: 'registry-default' },
    ]);
  });

  it('returns an empty scope when neither a .kb root nor a registry is found', async () => {
    const { kbs, registryError } = await resolveScope({ startDir: '/', allKbs: false, home: HOME_EMPTY });

    expect(kbs).toEqual([]);
    expect(registryError).toBeUndefined();
  });

  it('degrades a malformed registry to an empty registry and reports the load error', async () => {
    const { kbs, registryError } = await resolveScope({
      startDir: MALFORMED_REGISTRY,
      allKbs: false,
      home: HOME_EMPTY,
    });

    expect(kbs).toEqual([{ name: null, path: MALFORMED_REGISTRY, via: 'discovery' }]);
    expect(registryError).toMatch(/kb\.yaml/);
  });

  it('scopes to a single named store via registry-named when --store is set', async () => {
    const { kbs } = await resolveScope({
      startDir: PROJECT_KB,
      allKbs: false,
      storeName: 'global-vault',
      home: HOME_WITH_DEFAULT,
    });

    expect(kbs).toEqual([{ name: 'global-vault', path: VAULT_B, via: 'registry-named' }]);
  });

  it('suppresses the cwd-walk so that a discoverable project-local .kb/ is not added to scope', async () => {
    const { kbs } = await resolveScope({
      startDir: PROJECT_KB,
      allKbs: false,
      storeName: 'global-vault',
      home: HOME_WITH_DEFAULT,
    });

    expect(kbs.some((kb) => kb.path === PROJECT_KB)).toBe(false);
  });

  it('returns an empty scope with storeNotFound when the named store is unregistered', async () => {
    const { kbs, storeNotFound } = await resolveScope({
      startDir: PROJECT_KB,
      allKbs: false,
      storeName: 'no-such-store',
      home: HOME_WITH_DEFAULT,
    });

    expect(kbs).toEqual([]);
    expect(storeNotFound).toBe('no-such-store');
  });

  it('resolves --store against the project registry as well as the user registry', async () => {
    const { kbs } = await resolveScope({
      startDir: VISIBILITY_REGISTRY,
      allKbs: false,
      storeName: 'private-vault',
      home: HOME_WITH_DEFAULT,
    });

    expect(kbs).toEqual([
      { name: 'private-vault', path: join(VISIBILITY_REGISTRY, 'stores/private-vault'), via: 'registry-named' },
    ]);
  });

  it.each([
    { label: 'default scope', allKbs: false },
    { label: '--all-kbs', allKbs: true },
    { label: 'a --store hit', allKbs: false, storeName: 'vault-a' },
    { label: 'a --store miss', allKbs: false, storeName: 'no-such-store' },
  ])('lists every merged registry entry under $label', async ({ allKbs, storeName }) => {
    const { registeredStores } = await resolveScope({
      startDir: PROJECT_KB,
      allKbs,
      ...(storeName !== undefined && { storeName }),
      home: HOME_WITH_DEFAULT,
    });

    expect(registeredStores).toEqual([
      { name: 'global-vault', path: VAULT_B },
      { name: 'vault-a', path: VAULT_A },
      { name: 'vault-b', path: VAULT_B },
    ]);
  });

  it('lists no registered stores when the registry fails to load', async () => {
    const { registeredStores } = await resolveScope({ startDir: MALFORMED_REGISTRY, allKbs: false, home: HOME_EMPTY });

    expect(registeredStores).toEqual([]);
  });
});
