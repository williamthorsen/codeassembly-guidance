import { isKbLoaderError, loadKbConfig, type StoreVisibility } from '@williamthorsen/kb/config';
import { resolveKbDir } from '@williamthorsen/kb/layout';

/**
 * The outcome of checking a store's visibility before a record is created in it: a pass with the store's effective
 * visibility, a refusal of a `shared` store that the caller did not opt into, or a malformed `.kb/config.yaml`.
 */
export type SharedOptInOutcome =
  | { ok: true; visibility: StoreVisibility }
  | { ok: false; reason: 'shared-without-opt-in' }
  | { ok: false; reason: 'invalid-config'; message: string };

/**
 * Checks whether a caller may create a record in the store at `storePath`. A `shared` store requires `optedIn`; a
 * store whose config does not declare `visibility` takes the library's default. A malformed config fails closed, since
 * the store's visibility is then unknown. Any other I/O error propagates.
 */
export async function checkSharedOptIn(input: { storePath: string; optedIn: boolean }): Promise<SharedOptInOutcome> {
  let visibility: StoreVisibility;
  try {
    const config = await loadKbConfig({ kbRoot: { path: input.storePath, kbDir: resolveKbDir(input.storePath) } });
    visibility = config.visibility;
  } catch (error) {
    if (isKbLoaderError(error)) {
      return { ok: false, reason: 'invalid-config', message: error.message };
    }
    throw error;
  }

  if (visibility === 'shared' && !input.optedIn) {
    return { ok: false, reason: 'shared-without-opt-in' };
  }
  return { ok: true, visibility };
}
