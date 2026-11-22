import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';
import { scanOperationsDocs } from '../scan.ts';
import { makeFakeToken } from '../test-utils/make-fake-token.ts';

describe('scanOperationsDocs', () => {
  it('reports no findings when the operations directory is absent', () => {
    const root = makeScratchDir('record-external-operation-');

    expect(scanOperationsDocs(root)).toEqual({ findings: [], ok: true });
  });

  it('reports each finding with its path relative to the root, including in subdirectories', () => {
    const root = makeScratchDir('record-external-operation-');
    writeDoc(root, 'vercel.md', `# Vercel\n\n- **Credentials:** ${makeFakeToken('sk-', 30)}\n`);
    writeDoc(root, 'archive/neon.md', `# Neon\n\n${makeFakeToken('', 40)}\n`);

    expect(scanOperationsDocs(root)).toEqual({
      findings: [
        { excerpt: expect.any(String), file: 'docs/operations/archive/neon.md', kind: 'high-entropy', line: 3 },
        { excerpt: 'sk-…', file: 'docs/operations/vercel.md', kind: 'known-prefix', line: 3 },
      ],
      ok: false,
    });
  });

  it('ignores files that are not Markdown', () => {
    const root = makeScratchDir('record-external-operation-');
    writeDoc(root, 'notes.txt', makeFakeToken('sk-', 30));

    expect(scanOperationsDocs(root).ok).toBe(true);
  });
});

// region | Helpers

/** Writes `content` to `docs/operations/{relativePath}` under `root`, creating directories as needed. */
function writeDoc(root: string, relativePath: string, content: string): void {
  const file = path.join(root, 'docs', 'operations', relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

// endregion | Helpers
