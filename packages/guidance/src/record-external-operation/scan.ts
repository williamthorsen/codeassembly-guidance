// Scans a repository's operations documents for secret-shaped values.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { findSecrets, type SecretKind } from './secrets.ts';

/** The directory, relative to the repository root, that contains the operations documents. */
export const OPERATIONS_DIR = path.join('docs', 'operations');

/** One secret-shaped value in an operations document, with its path relative to the repository root. */
export interface ScanFinding {
  excerpt: string;
  file: string;
  kind: SecretKind;
  line: number;
}

/** The result of a scan: `ok` is true when there are no findings. */
export interface ScanResult {
  findings: ScanFinding[];
  ok: boolean;
}

/** Scans every Markdown file under `{root}/docs/operations/`, recursively. A missing directory yields no findings. */
export function scanOperationsDocs(root: string): ScanResult {
  const directory = path.join(root, OPERATIONS_DIR);
  const findings: ScanFinding[] = [];
  if (existsSync(directory)) {
    for (const file of listMarkdownFiles(directory)) {
      const relative = path.relative(root, file).split(path.sep).join('/');
      const matches = findSecrets(readFileSync(file, 'utf8'));
      for (const match of matches) {
        findings.push({ ...match, file: relative });
      }
    }
  }
  return { findings, ok: findings.length === 0 };
}

// region | Helpers

/** Returns the absolute paths of the Markdown files under `directory`, sorted. */
function listMarkdownFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .toSorted();
}

// endregion | Helpers
