import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeBodyStream } from '../../test-utils/make-body-stream.ts';
import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';
import { runAdd } from '../cli.ts';
import { makeKb } from '../test-utils/make-kb.ts';
import { NOW } from '../test-utils/now.ts';

describe(runAdd, () => {
  it('returns shared-kb, naming the flag, when a discovered shared KB is written without --shared', async () => {
    const kbPath = await makeKb({ visibility: 'shared' });

    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Refused'],
      stdin: makeBodyStream('Body.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result).toEqual({
      ok: false,
      error: 'shared-kb',
      message: expect.stringContaining('--shared'),
      details: { sharedKbPath: kbPath },
    });
    expect(await readdir(kbPath)).toEqual(['.kb']);
  });

  it('names a registered shared KB in its shared-kb refusal', async () => {
    const kbPath = await makeKb({ visibility: 'shared' });
    const homeDir = makeScratchDir('kb-add-shared-');
    await mkdir(join(homeDir, '.agents'), { recursive: true });
    await writeFile(join(homeDir, '.agents', 'kb.yaml'), `kbs:\n  team:\n    path: ${kbPath}\n`, 'utf8');

    const result = await runAdd({
      argv: ['--kb', 'team', '--diataxis', 'howto', '--title', 'Refused'],
      stdin: makeBodyStream(''),
      startDir: homeDir,
      now: NOW,
      home: homeDir,
    });

    expect(result).toEqual({
      ok: false,
      error: 'shared-kb',
      message: expect.stringContaining('"team"'),
      details: { sharedKbName: 'team', sharedKbPath: kbPath },
    });
  });

  it('writes into a shared KB when --shared is passed', async () => {
    const kbPath = await makeKb({ visibility: 'shared' });

    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Accepted', '--shared'],
      stdin: makeBodyStream('Body.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
  });

  it('writes into a private KB without --shared', async () => {
    const kbPath = await makeKb({ visibility: 'private' });

    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Private'],
      stdin: makeBodyStream('Body.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
  });

  it('returns invalid-config and writes nothing when the KB config is malformed', async () => {
    const kbPath = await makeKb();
    await writeFile(join(kbPath, '.kb', 'config.yaml'), 'visibility: public\n', 'utf8');

    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Refused', '--shared'],
      stdin: makeBodyStream('Body.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result).toEqual({ ok: false, error: 'invalid-config', message: expect.stringContaining('config.yaml') });
    expect(await readdir(kbPath)).toEqual(['.kb']);
  });
});
