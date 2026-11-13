import { findKbRoot, type KbRegistryEntry, tryLoadKbRegistry } from '@williamthorsen/kb/discovery';

import type { RegisteredStore, ScopedKb } from './types.ts';

/** The resolved query scope: the in-scope KBs, plus any resolution problem for the caller to report. */
export interface ScopeResult {
  /** The knowledge bases that the query should search. */
  kbs: ScopedKb[];
  /** Every entry of the merged `kb.yaml` registry, in registry order; empty when the registry failed to load. */
  registeredStores: RegisteredStore[];
  /** The `kb.yaml` load error message, present only when the registry was malformed or unreadable. */
  registryError?: string;
  /** The requested `--store`/`--kb` name that did not match any registry entry; present only on a named-store miss. */
  storeNotFound?: string;
}

/**
 * Resolves which knowledge bases a query should search.
 *
 * When `storeName` is set, scope is the single entry of that name in the merged registry and nothing else: `findKbRoot`
 * is skipped entirely, so a project-local `.kb/` cannot appear in results.
 *
 * Otherwise, default scope is the `.kb/`-discovered KB nearest `startDir`, the registry's resolved `default_kb`, and
 * every registry entry that declares `in_default_scope: true`; and `allKbs` widens scope to every entry in the merged
 * `kb.yaml` registry. A KB that more than one source admits is added to scope once, de-duplicated by absolute path,
 * with the provenance of the first source in that order.
 *
 * Degrades a malformed or unreadable registry to an empty list of registry entries, and records its message in
 * `registryError`.
 *
 * `home` overrides the directory from which the user-global `kb.yaml` is read; it defaults to the real `$HOME`
 * and exists so that tests can isolate registry resolution from the developer's environment.
 */
export async function resolveScope(input: {
  startDir: string;
  allKbs: boolean;
  storeName?: string;
  home?: string;
}): Promise<ScopeResult> {
  const registryLoad = tryLoadKbRegistry({
    projectDir: input.startDir,
    ...(input.home !== undefined && { home: input.home }),
  });

  if (input.storeName !== undefined) {
    const { config, error: registryError } = await registryLoad;
    const registeredStores = toRegisteredStores(config.entries);
    const match = config.entries.find((entry) => entry.name === input.storeName);
    if (match === undefined) {
      return {
        kbs: [],
        registeredStores,
        ...(registryError !== undefined && { registryError }),
        storeNotFound: input.storeName,
      };
    }
    return {
      kbs: [{ name: match.name, path: match.path, via: 'registry-named' }],
      registeredStores,
      ...(registryError !== undefined && { registryError }),
    };
  }

  const [discovered, { config, error: registryError }] = await Promise.all([
    findKbRoot({ startDir: input.startDir }),
    registryLoad,
  ]);

  const scoped: ScopedKb[] = [];
  const seenPaths = new Set<string>();

  function add(kb: ScopedKb): void {
    if (seenPaths.has(kb.path)) {
      return;
    }
    seenPaths.add(kb.path);
    scoped.push(kb);
  }

  if (discovered !== null) {
    add({ name: null, path: discovered.path, via: 'discovery' });
  }

  if (input.allKbs) {
    for (const entry of config.entries) {
      add({ name: entry.name, path: entry.path, via: 'registry-all' });
    }
  } else {
    if (config.defaultKb !== undefined) {
      add({ name: config.defaultKb.name, path: config.defaultKb.path, via: 'registry-default' });
    }
    for (const entry of config.entries) {
      if (entry.inDefaultScope === true) {
        add({ name: entry.name, path: entry.path, via: 'registry-in-default-scope' });
      }
    }
  }

  return {
    kbs: scoped,
    registeredStores: toRegisteredStores(config.entries),
    ...(registryError !== undefined && { registryError }),
  };
}

// region | Helpers

/** Projects registry entries onto the name and path that identify each store. */
function toRegisteredStores(entries: readonly KbRegistryEntry[]): RegisteredStore[] {
  return entries.map((entry) => ({ name: entry.name, path: entry.path }));
}

// endregion | Helpers
