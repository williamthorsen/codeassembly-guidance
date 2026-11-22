import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { DOCTRINE_REACH } from '../test-utils/doctrine-reach.ts';

// `gh` accepts `--body-file ""` without complaint and publishes its own default body, so a call site that invokes the
// CLI with an unset path fails silently. A GitHub write also publishes whatever repository the text names, so its guard
// is the public-reference check, which refuses an unset path as well. `doctrine-reach.unit.test.ts` checks that each
// carrier inlines the contract; this file checks that the calls written in each carrier follow it.

const CONTRACT = readContract();

/**
 * A body-file argument and the variable that it passes; `acli` names the description flag on its create call, and
 * `describe-change.mjs` names the pull-request body `--pr-body-file`. Capturing the variable ties the guard to the
 * path that the call actually passes, rather than to any guard that the block happens to contain: A carrier is created
 * by copying an existing block, and a renamed path with an un-renamed guard is the drift that copying produces.
 */
const BODY_FILE_ARGUMENT = /--(?:body|description|pr-body)-file "\$(\w+)"/g;

/** The helper that guards a GitHub write, refusing a private reference and a missing or empty body file. */
const CHECK = 'check-public-references.mjs';

/** A `gh` call that publishes a title, a body, or a comment. */
const GITHUB_WRITE = /\bgh (?:issue|pr) (?:create|edit|comment)\b/;

/** The guard itself, which turns a missing or empty body file into a refusal. */
const GUARD = '[ -s "$body_path" ]';

/** A target-repository argument, written as `--repo` or as a placeholder whose name contains `repo`. */
const REPO_ARGUMENT = /--repo[ =](?:"[^"]*"|\S+)|\{\w*repo\w*\}/g;

/** A title argument and the text that it passes. */
const TITLE_ARGUMENT = /--title "([^"]*)"/g;

describe('gh-body-file call sites', () => {
  it('includes both guards in the partial', async () => {
    const partial = await readFile(path.join(CONTENT_ROOT, CONTRACT.source), 'utf8');
    expect(partial).toContain(GUARD);
    expect(partial).toContain(CHECK);
  });

  it('guards every call that passes a body file', async () => {
    const violations: Array<string> = [];
    for (const relativePath of CONTRACT.carriers) {
      const content = await readFile(path.join(CONTENT_ROOT, relativePath), 'utf8');
      for (const block of listShellBlocks(content)) {
        if (listBodyFileVariables(block).length === 0) continue;
        const violation = GITHUB_WRITE.test(block) ? findUncheckedGithubWrite(block) : findUnguardedVariable(block);
        if (violation !== undefined) violations.push(`${relativePath} -> ${violation}`);
      }
    }
    const message = `An unguarded body-file call publishes the platform's default body when the path is unset, and an unchecked GitHub write publishes the private references in its text; these calls lack the guard that their target needs:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });

  it.each(['condense-branch', 'merge-gh-pr'])(
    'passes literal paths to the %s helper, without shell composition',
    async (skill) => {
      const content = await readFile(path.join(CONTENT_ROOT, `skills/${skill}/SKILL.md`), 'utf8');
      const helperBlocks = listShellBlocks(content).filter((block) => block.includes(`${skill}.mjs`));

      expect(helperBlocks).toHaveLength(1);
      for (const block of helperBlocks) {
        expect(block).not.toContain('$');
        expect(block).not.toMatch(/\{\s/);
        expect(block).not.toContain('gh api');
      }
    },
  );

  it('checks the merge files before merge-gh-pr merges', async () => {
    const content = await readFile(path.join(CONTENT_ROOT, 'skills/merge-gh-pr/SKILL.md'), 'utf8');
    const blocks = listShellBlocks(content);
    const checkIndex = blocks.findIndex((block) => block.includes(CHECK));
    const mergeIndex = blocks.findIndex((block) => block.includes('merge-gh-pr.mjs'));

    expect(checkIndex).toBeGreaterThanOrEqual(0);
    expect(checkIndex).toBeLessThan(mergeIndex);
  });
});

// region | Helpers

/** Describes how a GitHub write block departs from the check pattern, or returns `undefined` when it follows it. */
function findUncheckedGithubWrite(block: string): string | undefined {
  const lines = block.split('\n');
  const checkLine = lines.find((line) => line.includes(CHECK));
  if (checkLine === undefined) return `GitHub write without ${CHECK}`;
  if (!checkLine.trimEnd().endsWith('|| exit 1')) return `${CHECK} does not stop the write on a refusal`;
  const writeText = lines.filter((line) => line !== checkLine).join('\n');
  for (const variable of listBodyFileVariables(writeText)) {
    if (!checkLine.includes(`--body-file "$${variable}"`)) return `${CHECK} does not check $${variable}`;
  }
  for (const match of writeText.matchAll(TITLE_ARGUMENT)) {
    if (!checkLine.includes(match[0])) return `${CHECK} does not check the title ${match[0]}`;
  }
  for (const match of writeText.matchAll(REPO_ARGUMENT)) {
    if (!checkLine.includes(match[0])) return `${CHECK} does not check the target ${match[0]}`;
  }
  return undefined;
}

/** Names the first body-file variable that the block passes without a `[ -s ]` guard on it. */
function findUnguardedVariable(block: string): string | undefined {
  const unguarded = listBodyFileVariables(block).find((variable) => !block.includes(`[ -s "$${variable}" ]`));
  return unguarded === undefined ? undefined : `$${unguarded}`;
}

/** Returns the variable passed by each of a block's body-file arguments, one entry per argument. */
function listBodyFileVariables(block: string): Array<string> {
  const variables: Array<string> = [];
  for (const match of block.matchAll(BODY_FILE_ARGUMENT)) {
    const variable = match[1];
    if (variable !== undefined) variables.push(variable);
  }
  return variables;
}

/** Returns the bodies of a Markdown file's fenced `bash` blocks, indented ones inside list items included. */
function listShellBlocks(content: string): Array<string> {
  const blocks: Array<string> = [];
  const pattern = /^[ \t]*```bash\n([\s\S]*?)^[ \t]*```$/gm;
  let match = pattern.exec(content);
  while (match !== null) {
    const body = match[1];
    if (body !== undefined) blocks.push(body);
    match = pattern.exec(content);
  }
  return blocks;
}

/** Returns the `gh-body-file` row of the reach table, which names the partial and the files that carry it. */
function readContract(): (typeof DOCTRINE_REACH)[string] {
  const contract = DOCTRINE_REACH['gh-body-file'];
  if (contract === undefined) throw new Error('The reach table does not contain gh-body-file');
  return contract;
}

// endregion | Helpers
