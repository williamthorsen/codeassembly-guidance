/* eslint n/no-process-exit: off -- CLI entry point: The process must exit non-zero on failure, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the resolve-ticket-target helper: fetches another repository's ticket configuration and prints
// where it was written as JSON.

import { tmpdir } from 'node:os';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { runGh } from '../shared/gh.ts';
import { resolveTicketTarget } from './resolve-ticket-target.ts';

const PROGRAM = 'resolve-ticket-target';

/** Resolves the target that `--repo` names, writing the result to stdout and a warning per missing file to stderr. */
async function main(): Promise<void> {
  try {
    const { flags, positionals } = scanFlags(process.argv.slice(2), [{ name: 'repo', takesValue: true }]);
    if (positionals.length > 0) {
      throw new Error(`unexpected argument: ${positionals.join(' ')}`);
    }
    const repo = valueFlagMap(flags)['repo']?.trim();
    if (repo === undefined || repo === '') {
      throw new Error('--repo is required');
    }

    const target = await resolveTicketTarget({ gh: runGh, repo, tempRoot: tmpdir() });
    for (const file of target.missing) {
      process.stderr.write(`${PROGRAM}: ${target.repo} does not contain ${file} on its default branch\n`);
    }
    process.stdout.write(`${JSON.stringify(target)}\n`);
  } catch (error) {
    process.stderr.write(`${PROGRAM}: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, PROGRAM)) {
  await main();
}
