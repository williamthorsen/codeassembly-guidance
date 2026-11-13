import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { StoreVisibility } from '@williamthorsen/kb/config';

import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';

const STORE_CONFIG = `targets:
  - 'content/**/*.md'
exclude:
  - '**/node_modules/**'
`;

/** Creates a temp event store plus an isolated home that registers it under `name` and marks it `default_kb`. */
export async function makeStore(
  name: string,
  options: { visibility?: StoreVisibility } = {},
): Promise<{ storePath: string; home: string }> {
  const storePath = await makeStoreDir(options);

  const home = makeScratchDir('capture-cli-home-');
  await mkdir(join(home, '.agents'), { recursive: true });
  await writeFile(
    join(home, '.agents', 'kb.yaml'),
    `default_kb: ${name}\nkbs:\n  ${name}:\n    path: ${storePath}\n`,
    'utf8',
  );

  return { storePath, home };
}

/**
 * Creates a temp event store directory containing a default `.kb/config.yaml`, which declares `visibility` when given,
 * returning its path.
 */
export async function makeStoreDir(options: { visibility?: StoreVisibility } = {}): Promise<string> {
  const storePath = makeScratchDir('capture-cli-store-');
  await mkdir(join(storePath, '.kb'), { recursive: true });
  const visibility = options.visibility === undefined ? '' : `visibility: ${options.visibility}\n`;
  await writeFile(join(storePath, '.kb', 'config.yaml'), STORE_CONFIG + visibility, 'utf8');
  return storePath;
}
