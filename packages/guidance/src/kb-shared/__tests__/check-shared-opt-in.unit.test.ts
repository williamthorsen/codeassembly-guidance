import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';
import { checkSharedOptIn } from '../check-shared-opt-in.ts';

describe(checkSharedOptIn, () => {
  it('refuses a shared store when the caller did not opt in', async () => {
    const storePath = await makeStoreWithConfig('visibility: shared\n');

    const result = await checkSharedOptIn({ storePath, optedIn: false });

    expect(result).toEqual({ ok: false, reason: 'shared-without-opt-in' });
  });

  it('passes a shared store when the caller opted in', async () => {
    const storePath = await makeStoreWithConfig('visibility: shared\n');

    const result = await checkSharedOptIn({ storePath, optedIn: true });

    expect(result).toEqual({ ok: true, visibility: 'shared' });
  });

  it.each([
    ['declares private', 'visibility: private\n'],
    ['does not declare visibility', 'targets:\n  - "content/**/*.md"\n'],
    ['does not have a config file', null],
  ])('passes a store that %s, with or without the opt-in', async (_label, config) => {
    const storePath = await makeStoreWithConfig(config);

    await expect(checkSharedOptIn({ storePath, optedIn: false })).resolves.toEqual({ ok: true, visibility: 'private' });
    await expect(checkSharedOptIn({ storePath, optedIn: true })).resolves.toEqual({ ok: true, visibility: 'private' });
  });

  it('fails closed on a malformed config', async () => {
    const storePath = await makeStoreWithConfig('visibility: public\n');

    const result = await checkSharedOptIn({ storePath, optedIn: true });

    expect(result).toEqual({ ok: false, reason: 'invalid-config', message: expect.stringContaining('config.yaml') });
  });
});

// region | Helpers

/** Creates a scratch store whose `.kb/config.yaml` contains `config`, or a store without the file when `null`. */
async function makeStoreWithConfig(config: string | null): Promise<string> {
  const storePath = makeScratchDir('check-shared-opt-in-');
  await mkdir(join(storePath, '.kb'), { recursive: true });
  if (config !== null) {
    await writeFile(join(storePath, '.kb', 'config.yaml'), config, 'utf8');
  }
  return storePath;
}

// endregion | Helpers
