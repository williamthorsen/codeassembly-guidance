import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { disposeOnTestFinished } from '@williamthorsen/toolbelt.vitest/candidate';

/**
 * Creates an empty directory under the OS temp directory, removed when the current test finishes, failure included,
 * and returns its realpath. Callable from a test body or a `beforeEach` hook; a directory shared across a file is a
 * `createTempTree` handle disposed in `afterAll` instead.
 */
export function makeScratchDir(prefix: string): string {
  return disposeOnTestFinished(createTempTree({}, { prefix })).dir;
}
