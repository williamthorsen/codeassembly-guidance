import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// The session-context deriver emits `project_artifact_dir` and `ticket_dir`, so a skill reads those fields rather than
// composing the artifact directories from `artifact_base_dir`, `project_slug`, and `ticket_id`.
const FORBIDDEN_PATTERNS: ReadonlyArray<string> = [
  'projects/{project_slug}',
  'projects/{project-slug}',
  'tickets/{ticket_id}',
  'tickets/{ticket-id}',
];

const ALLOWLIST: ReadonlyArray<string> = [
  // Its directory tree and path blocks illustrate the layout that the deriver composes.
  'skills/_data/artifact-conventions.md',
  // It saves the ticket that it creates, whose ID and, for a target repository, project slug differ from the
  // manifest's.
  'skills/create-ticket/SKILL.md',
];

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

describe('artifact directory template', () => {
  it('Markdown files outside the allowlist do not compose an artifact directory', async () => {
    const violations = await findViolations();
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it('every allowlist entry resolves to a real file', async () => {
    const present = new Set((await listMarkdownFiles(CONTENT_ROOT)).map(toContentPath));
    const missing = ALLOWLIST.filter((entry) => !present.has(entry));
    expect(missing, `Stale allowlist entries (file no longer exists): ${missing.join(', ')}`).toEqual([]);
  });
});

// region | Helpers

async function findViolations(): Promise<ReadonlyArray<Violation>> {
  const allowlist = new Set(ALLOWLIST);
  const violations: Array<Violation> = [];
  const files = await listMarkdownFiles(CONTENT_ROOT);
  for (const file of files) {
    const relativePath = toContentPath(file);
    if (allowlist.has(relativePath)) continue;
    const lines = (await readFile(file, 'utf8')).split('\n');
    for (const [index, line] of lines.entries()) {
      if (FORBIDDEN_PATTERNS.some((pattern) => line.includes(pattern))) {
        violations.push({ file: relativePath, line: index + 1, text: line.trim() });
      }
    }
  }
  return violations;
}

function formatViolations(violations: ReadonlyArray<Violation>): string {
  if (violations.length === 0) return '';
  const header =
    `Found ${violations.length} composed artifact director(ies). Read \`ticket_dir\` or \`project_artifact_dir\` ` +
    'from the session-context manifest instead; `save-artifact` states the fallback for a null `ticket_dir`.';
  const lines = violations.map((v) => `  ${v.file}:${v.line}: ${v.text}`);
  return [header, ...lines].join('\n');
}

function toContentPath(file: string): string {
  return path.relative(CONTENT_ROOT, file).split(path.sep).join('/');
}

// endregion | Helpers
