import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { readContentFile } from '../../../content/test-utils/read-content-file.ts';
import { makeScratchDir } from '../../test-utils/make-scratch-dir.ts';
import { ACTIONABLE_FINDING_HEADING, readRunState } from '../review-run.ts';

const RUN = '20261002-090000Z-interactive';

const REVIEW_WITH_FINDINGS = [
  '# Code review',
  '#### F1: Broken guard',
  '#### W2: Unjustified default',
  '#### S3: Rename',
  '#### T1-L: Old debt',
].join('\n');

describe('readRunState', () => {
  let ticketDir: string;

  beforeEach(() => {
    ticketDir = makeScratchDir('review-run-state-');
  });

  it('reports nulls when the ticket directory does not contain an active run', async () => {
    expect(await readRunState(ticketDir)).toEqual({
      runDir: null,
      hasReview: false,
      newestPath: null,
      newestKind: null,
      findings: null,
    });
  });

  it('counts the actionable findings of a newest review, leaving out legacy ones', async () => {
    const reviewPath = await writeArtifact('20261002-100000Z_reviewer_review.md', REVIEW_WITH_FINDINGS);

    expect(await readRunState(ticketDir)).toEqual({
      runDir: path.join(ticketDir, RUN),
      hasReview: true,
      newestPath: reviewPath,
      newestKind: 'review',
      findings: 3,
    });
  });

  it('reports zero findings for a review that does not contain any', async () => {
    await writeArtifact('20261002-100000Z_reviewer_review.md', '# Code review\n#### T1-L: Old debt\n');

    expect(await readRunState(ticketDir)).toMatchObject({ newestKind: 'review', findings: 0 });
  });

  it('reports a response newer than the review, and one with the same timestamp', async () => {
    await writeArtifact('20261002-100000Z_reviewer_review.md', REVIEW_WITH_FINDINGS);
    const responsePath = await writeArtifact('20261002-100000Z_coder_change-summary.md', '');

    expect(await readRunState(ticketDir)).toEqual({
      runDir: path.join(ticketDir, RUN),
      hasReview: true,
      newestPath: responsePath,
      newestKind: 'response',
      findings: null,
    });
  });

  it('reports a change summary without a review as the newest artifact of a run without a review', async () => {
    await writeArtifact('20261002-090000Z_coder_change-summary.md', '');

    expect(await readRunState(ticketDir)).toMatchObject({ hasReview: false, newestKind: 'response' });
  });

  it('matches the finding heading of the review-branch template', async () => {
    const template = await readContentFile('skills/review-branch/SKILL.md');

    expect(template.match(ACTIONABLE_FINDING_HEADING)).toEqual(['#### F1:']);
  });

  // region | Helpers

  /** Writes an artifact into the run directory and returns its path. */
  async function writeArtifact(fileName: string, content: string): Promise<string> {
    const runDir = path.join(ticketDir, RUN);
    await mkdir(runDir, { recursive: true });
    const filePath = path.join(runDir, fileName);
    await writeFile(filePath, content);
    return filePath;
  }

  // endregion | Helpers
});
