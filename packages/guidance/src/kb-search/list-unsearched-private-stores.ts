import { realpath } from 'node:fs/promises';

import { loadKbConfig } from '@williamthorsen/kb/config';
import { resolveKbDir } from '@williamthorsen/kb/layout';

import type { RegisteredStore } from './types.ts';

/**
 * Returns, in registry order, each registered store that the recall did not search and whose effective visibility is
 * `private`. A store whose config cannot be read counts as `private`, so that a read failure never hides a store.
 * Paths are compared after symlink resolution, so that a store reached through discovery counts as searched.
 */
export async function listUnsearchedPrivateStores(input: {
  registeredStores: readonly RegisteredStore[];
  searchedPaths: readonly string[];
}): Promise<RegisteredStore[]> {
  const searched = new Set(await Promise.all(input.searchedPaths.map(resolveRealPath)));
  const unsearched: RegisteredStore[] = [];
  for (const store of input.registeredStores) {
    if (searched.has(await resolveRealPath(store.path))) {
      continue;
    }
    if (await isPrivate(store.path)) {
      unsearched.push({ name: store.name, path: store.path });
    }
  }
  return unsearched;
}

// region | Helpers

/** Reports whether the store at `storePath` is `private`, treating any failure to read its config as `private`. */
async function isPrivate(storePath: string): Promise<boolean> {
  try {
    const config = await loadKbConfig({ kbRoot: { path: storePath, kbDir: resolveKbDir(storePath) } });
    return config.visibility === 'private';
  } catch {
    return true;
  }
}

/** Resolves symlinks in `path`, returning it unchanged when it does not exist. */
async function resolveRealPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

// endregion | Helpers
