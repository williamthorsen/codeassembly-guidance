import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';

/** Builds a temp KB rooted at a fresh directory with a `.kb/` marker. */
export async function makeKb(): Promise<string> {
  const root = makeScratchDir('kb-add-cli-');
  await mkdir(join(root, '.kb'), { recursive: true });
  return root;
}
