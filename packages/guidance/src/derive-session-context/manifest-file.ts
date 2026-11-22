/** Reads and writes the branch manifest file that the session-context deriver keeps under `.agents/`. */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { isEnoent, isRecord } from '../lib/type-guards.ts';

/** A manifest file read from disk: its text, and its parsed content when that is an object. */
export interface PriorManifest {
  readonly path: string;
  readonly text: string;
  readonly record: Record<string, unknown> | undefined;
}

/**
 * Reads the manifest file at `filePath`, or returns `null` when the file does not exist. Content that is not valid JSON
 * or not an object yields an undefined `record`.
 */
export async function readPriorManifest(filePath: string): Promise<PriorManifest | null> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Warn so that an operator can explain a vanished `ticket_url` or `pr_url`.
    process.stderr.write(
      `derive-session-context: warning: prior manifest at ${filePath} is corrupt; stored URLs not carried forward\n`,
    );
    return { path: filePath, text, record: undefined };
  }
  return { path: filePath, text, record: isRecord(parsed) ? parsed : undefined };
}

/**
 * Writes `content` to `targetPath` atomically: writes a sibling temp file, then renames it over the target with
 * `rename()` so that a concurrent reader never observes a half-written file. The temp file shares the target's
 * directory so that the rename stays within one filesystem.
 */
export async function writeManifest(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(tempPath, content, 'utf8');
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}
