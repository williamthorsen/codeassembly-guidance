import { chmodSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from './is-record.ts';
import { makeSmokeScratchDir } from './smoke-scratch.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Puts a `gh` stand-in first on `PATH`, then returns an invocation that lists `acme/widgets#2` and its blocker in
 * another repository, `acme/core-lib#1`. The stand-in answers `issue view` for both, so the run exercises a fetch, a
 * cross-repository blocker, and the tree without contacting GitHub.
 */
export function makeListImplementationOrderSmokeTest(): SmokeTestInvocation {
  const binDir = makeSmokeScratchDir('list-implementation-order-bin-');
  const ghPath = path.join(binDir, 'gh');
  const blocker = '{"number":1,"state":"OPEN","title":"Blocker","url":"https://github.com/acme/core-lib/issues/1"}';
  const script = [
    `#!${process.execPath}`,
    `const blocker = ${blocker};`,
    'const blocked = { number: 2, state: "OPEN", title: "Blocked", url: "https://github.com/acme/widgets/issues/2" };',
    'const issue = process.argv[4] === "2" ? { ...blocked, blockedBy: { nodes: [blocker] } } : { ...blocker, blockedBy: { nodes: [] } };',
    'process.stdout.write(JSON.stringify(issue));',
  ].join('\n');
  writeFileSync(ghPath, `${script}\n`);
  chmodSync(ghPath, 0o755);

  return {
    args: ['--ticket', 'acme/widgets#2', '--ticket', 'acme/core-lib#1'],
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env['PATH'] ?? ''}` },
    assertResult: assertBlockedTicketNested,
  };
}

// region | Helpers

/** Asserts that the parsed result lists the blocker first and the blocked ticket one level under it. */
function assertBlockedTicketNested(result: unknown): void {
  const tickets = isRecord(result) && Array.isArray(result['tickets']) ? result['tickets'] : [];
  const summary = tickets.map((ticket: unknown) =>
    isRecord(ticket) ? `${String(ticket['label'])}@${String(ticket['depth'])}` : '',
  );
  if (summary.join(' ') !== 'CL.1@0 WI.2@1') {
    throw new Error(`expected CL.1 at depth 0 and WI.2 at depth 1, got ${JSON.stringify(result)}`);
  }
}

// endregion | Helpers
