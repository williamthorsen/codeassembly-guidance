import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';

const scratchDirs = new DisposableStack();

/** Removes every directory that `makeSmokeScratchDir` has created, most recent first. */
export function disposeSmokeScratchDirs(): void {
  scratchDirs.dispose();
}

/**
 * Creates an empty directory under the OS temp directory for a smoke-test fixture and returns its realpath. The
 * directory lives until the smoke-test runner calls `disposeSmokeScratchDirs`.
 */
export function makeSmokeScratchDir(prefix: string): string {
  return scratchDirs.use(createTempTree({}, { prefix })).dir;
}
