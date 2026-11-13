import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { StoreVisibility } from '@williamthorsen/kb/config';

import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';

/** Builds a temp KB rooted at a fresh directory with a `.kb/` marker, declaring `visibility` in its config when given. */
export async function makeKb(options: { visibility?: StoreVisibility } = {}): Promise<string> {
  const root = makeScratchDir('kb-add-cli-');
  await mkdir(join(root, '.kb'), { recursive: true });
  if (options.visibility !== undefined) {
    await writeFile(join(root, '.kb', 'config.yaml'), `visibility: ${options.visibility}\n`, 'utf8');
  }
  return root;
}
