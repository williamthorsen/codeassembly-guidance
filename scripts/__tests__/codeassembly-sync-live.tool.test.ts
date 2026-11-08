import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { disposeOnTestFinished } from '@williamthorsen/toolbelt.vitest/candidate';
import { beforeEach, describe, expect, it } from 'vitest';

const scriptSource = path.join(import.meta.dirname, '..', 'codeassembly-sync-live.sh');

const cliBinPath = path.join('packages', 'agents', 'bin', 'codeassembly.js');

describe('codeassembly-sync-live', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = createFixture();
  });

  it('advances live to origin/main, builds both live worktrees, and deploys with the sibling CLI', () => {
    const target = commitAndPush(fixture, 'second');
    const cliHead = readHead(fixture.cliDir);

    const result = runSyncLive(fixture);

    expect(result.status).toBe(0);
    expect(readHead(fixture.liveDir)).toBe(target);
    expect(readHead(fixture.cliDir)).toBe(cliHead);
    expect(result.stdout).toContain(`to ${target.slice(0, 8)} (origin/main)`);
    expect(readDeployLog(fixture)).toStrictEqual(buildExpectedLog(fixture, fixture.cliDir));
  });

  it('deploys with the CLI that CODEASSEMBLY_LIVE_DIR names in place of the sibling', () => {
    const overrideDir = createCliWorktree(path.join(fixture.baseDir, 'elsewhere', 'packages.live'));

    const result = runSyncLive(fixture, [], { CODEASSEMBLY_LIVE_DIR: overrideDir });

    expect(result.status).toBe(0);
    expect(readDeployLog(fixture)).toStrictEqual(buildExpectedLog(fixture, overrideDir));
  });

  it('refuses before advancing live when the sibling CLI worktree is missing', () => {
    commitAndPush(fixture, 'second');
    rmSync(fixture.cliDir, { recursive: true, force: true });
    const before = readHead(fixture.liveDir);

    const result = runSyncLive(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${fixture.cliDir} (the sibling path)`);
    expect(result.stderr).toContain('Set CODEASSEMBLY_LIVE_DIR');
    expect(readHead(fixture.liveDir)).toBe(before);
    expect(readDeployLog(fixture)).toStrictEqual([]);
  });

  it('refuses before advancing live when CODEASSEMBLY_LIVE_DIR names a directory without the CLI', () => {
    commitAndPush(fixture, 'second');
    const before = readHead(fixture.liveDir);
    const missingDir = path.join(fixture.baseDir, 'missing');

    const result = runSyncLive(fixture, [], { CODEASSEMBLY_LIVE_DIR: missingDir });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${missingDir} (from CODEASSEMBLY_LIVE_DIR)`);
    expect(readHead(fixture.liveDir)).toBe(before);
    expect(readDeployLog(fixture)).toStrictEqual([]);
  });

  it('advances live to an explicit commit', () => {
    const target = commitAndPush(fixture, 'second');
    commitAndPush(fixture, 'third');

    const result = runSyncLive(fixture, [target]);

    expect(result.status).toBe(0);
    expect(readHead(fixture.liveDir)).toBe(target);
  });

  it('deploys when live is already at the commit', () => {
    const result = runSyncLive(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('live is already at');
    expect(readDeployLog(fixture)).toStrictEqual(buildExpectedLog(fixture, fixture.cliDir));
  });

  it('refuses an unknown ref with exit 2', () => {
    const before = readHead(fixture.liveDir);

    const result = runSyncLive(fixture, ['no-such-ref']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown ref 'no-such-ref'");
    expect(readHead(fixture.liveDir)).toBe(before);
    expect(readDeployLog(fixture)).toStrictEqual([]);
  });

  it('refuses when live cannot fast-forward', () => {
    commitAndPush(fixture, 'second');
    writeFileSync(path.join(fixture.liveDir, 'diverged.txt'), 'diverged\n');
    runGit(fixture.liveDir, ['add', 'diverged.txt']);
    runGit(fixture.liveDir, ['commit', '--message', 'diverged']);
    const before = readHead(fixture.liveDir);

    const result = runSyncLive(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('live cannot fast-forward');
    expect(readHead(fixture.liveDir)).toBe(before);
    expect(readDeployLog(fixture)).toStrictEqual([]);
  });

  it('refuses when the live worktree has uncommitted changes', () => {
    commitAndPush(fixture, 'second');
    writeFileSync(path.join(fixture.liveDir, 'stray.txt'), 'stray\n');
    const before = readHead(fixture.liveDir);

    const result = runSyncLive(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('has uncommitted changes');
    expect(readHead(fixture.liveDir)).toBe(before);
    expect(readDeployLog(fixture)).toStrictEqual([]);
  });

  it('names the deploy step that fails and stops', () => {
    const result = runSyncLive(fixture, [], { STUB_PNPM_FAIL_ON: 'nmr' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("deploy step 'build guidance' failed");
    expect(readDeployLog(fixture)).toStrictEqual(buildExpectedLog(fixture, fixture.cliDir).slice(0, 2));
  });

  it('refuses when the live branch exists without a worktree', () => {
    runGit(fixture.repoDir, ['worktree', 'remove', fixture.liveDir]);
    const before = readHead(fixture.repoDir);

    const result = runSyncLive(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('has the live branch checked out');
    expect(result.stderr).toContain('Create it with');
    expect(readHead(fixture.repoDir)).toBe(before);
    expect(readDeployLog(fixture)).toStrictEqual([]);
  });
});

describe('codeassembly-sync-live without a live worktree', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = createFixture({ live: false });
  });

  it('advances main to origin/main and deploys with the pinned CLI', () => {
    const target = pushFromOtherClone(fixture, 'second');

    const result = runSyncLive(fixture);

    expect(result.status).toBe(0);
    expect(readHead(fixture.repoDir)).toBe(target);
    expect(result.stdout).toContain('Advanced main from');
    expect(result.stdout).toContain(`to ${target.slice(0, 8)} (origin/main)`);
    expect(result.stdout).toContain(`Deployed guidance from main at ${target.slice(0, 8)}`);
    expect(readDeployLog(fixture)).toStrictEqual(buildExpectedMainLog(fixture));
  });

  it('advances main to an explicit commit', () => {
    const target = pushFromOtherClone(fixture, 'second');
    pushFromOtherClone(fixture, 'third');

    const result = runSyncLive(fixture, [target]);

    expect(result.status).toBe(0);
    expect(readHead(fixture.repoDir)).toBe(target);
  });

  it('deploys when main is already at the commit', () => {
    const result = runSyncLive(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('main is already at');
    expect(readDeployLog(fixture)).toStrictEqual(buildExpectedMainLog(fixture));
  });

  it('refuses when the main worktree is on another branch', () => {
    pushFromOtherClone(fixture, 'second');
    runGit(fixture.repoDir, ['switch', '--quiet', '--create', 'feature']);
    const before = readBranchHead(fixture.repoDir, 'main');

    const result = runSyncLive(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`the main worktree at ${fixture.repoDir} is not on main; main is unchanged`);
    expect(readBranchHead(fixture.repoDir, 'main')).toBe(before);
    expect(readDeployLog(fixture)).toStrictEqual([]);
  });

  it('refuses when the main worktree has uncommitted changes', () => {
    pushFromOtherClone(fixture, 'second');
    writeFileSync(path.join(fixture.repoDir, 'stray.txt'), 'stray\n');
    const before = readHead(fixture.repoDir);

    const result = runSyncLive(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('has uncommitted changes; main is unchanged');
    expect(readHead(fixture.repoDir)).toBe(before);
    expect(readDeployLog(fixture)).toStrictEqual([]);
  });

  it('refuses when main cannot fast-forward', () => {
    pushFromOtherClone(fixture, 'second');
    runGit(fixture.repoDir, ['commit', '--allow-empty', '--message', 'diverged']);
    const before = readHead(fixture.repoDir);

    const result = runSyncLive(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('main cannot fast-forward');
    expect(readHead(fixture.repoDir)).toBe(before);
    expect(readDeployLog(fixture)).toStrictEqual([]);
  });

  it('refuses an unknown ref with exit 2', () => {
    const before = readHead(fixture.repoDir);

    const result = runSyncLive(fixture, ['no-such-ref']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown ref 'no-such-ref'");
    expect(readHead(fixture.repoDir)).toBe(before);
    expect(readDeployLog(fixture)).toStrictEqual([]);
  });

  it('names the deploy step that fails and stops', () => {
    const result = runSyncLive(fixture, [], { STUB_PNPM_FAIL_ON: 'nmr' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("deploy step 'build guidance' failed");
    expect(result.stderr).toContain('main is already advanced');
    expect(readDeployLog(fixture)).toStrictEqual(buildExpectedMainLog(fixture).slice(0, 2));
  });
});

// region | Helpers

interface Fixture {
  baseDir: string;
  cliDir: string;
  logPath: string;
  liveDir: string;
  originDir: string;
  repoDir: string;
  stubBinDir: string;
}

interface FixtureOptions {
  /** Whether to create the live worktree and the packages repository's live worktree; defaults to true. */
  live?: boolean;
}

/** Lists the deploy steps, each as `<command>|<cwd>`, that a complete run records with the CLI in `cliDir`. */
function buildExpectedLog(fixture: Fixture, cliDir: string): string[] {
  return [
    `pnpm install --frozen-lockfile|${fixture.liveDir}`,
    `pnpm exec nmr build|${fixture.liveDir}`,
    `pnpm install --frozen-lockfile|${cliDir}`,
    `pnpm exec nmr build|${cliDir}`,
    `codeassembly ${cliDir} install --link|${fixture.liveDir}`,
    `codeassembly ${cliDir} sync --global|${fixture.liveDir}`,
  ];
}

/** Lists the deploy steps, each as `<command>|<cwd>`, that a complete run without a live worktree records. */
function buildExpectedMainLog(fixture: Fixture): string[] {
  return [
    `pnpm install --frozen-lockfile|${fixture.repoDir}`,
    `pnpm exec nmr build|${fixture.repoDir}`,
    `pnpm exec codeassembly install --link|${fixture.repoDir}`,
    `pnpm exec codeassembly sync --global|${fixture.repoDir}`,
  ];
}

/** Adds an empty commit to the fixture's main branch, pushes it to origin, and returns its SHA. */
function commitAndPush(fixture: Fixture, message: string): string {
  runGit(fixture.repoDir, ['commit', '--allow-empty', '--message', message]);
  runGit(fixture.repoDir, ['push', '--quiet', 'origin', 'main']);
  return readHead(fixture.repoDir);
}

/**
 * Creates a git repository at `dir` that stands in for the packages repository's live worktree: Its stub CLI appends
 * its own worktree, its arguments, and its working directory to the log.
 */
function createCliWorktree(dir: string): string {
  const binPath = path.join(dir, cliBinPath);
  mkdirSync(path.dirname(binPath), { recursive: true });
  writeFileSync(
    binPath,
    [
      "import { appendFileSync } from 'node:fs';",
      "import path from 'node:path';",
      "const worktree = path.resolve(import.meta.dirname, '..', '..', '..');",
      "appendFileSync(process.env.SYNC_LIVE_LOG, `codeassembly ${worktree} ${process.argv.slice(2).join(' ')}|${process.cwd()}\\n`);",
      '',
    ].join('\n'),
  );
  writeFileSync(path.join(dir, 'package.json'), '{ "type": "module" }\n');
  runGit(dir, ['init', '--quiet', '--initial-branch=live']);
  runGit(dir, ['add', '.']);
  runGit(dir, ['commit', '--quiet', '--message', 'initial']);
  return dir;
}

/**
 * Builds a scratch guidance repository whose main branch contains a copy of the script, with a bare origin, a stub
 * pnpm, and, unless `live` is false, a live worktree and a stand-in for the packages repository's live worktree at the
 * sibling path. The stubs append each deploy step to a log.
 */
function createFixture({ live = true }: FixtureOptions = {}): Fixture {
  const baseDir = disposeOnTestFinished(createTempTree({}, { prefix: 'sync-live-' })).dir;
  const originDir = path.join(baseDir, 'origin.git');
  const repoDir = path.join(baseDir, 'repo');
  const liveDir = path.join(baseDir, 'repo.live');
  const cliDir = path.join(baseDir, 'codeassembly.live');
  if (live) createCliWorktree(cliDir);
  const stubBinDir = path.join(baseDir, 'stub-bin');
  const logPath = path.join(baseDir, 'deploy.log');

  runGit(baseDir, ['init', '--quiet', '--bare', '--initial-branch=main', originDir]);
  runGit(baseDir, ['init', '--quiet', '--initial-branch=main', repoDir]);

  const scriptPath = path.join(repoDir, 'scripts', 'codeassembly-sync-live.sh');
  mkdirSync(path.dirname(scriptPath), { recursive: true });
  copyFileSync(scriptSource, scriptPath);
  chmodSync(scriptPath, 0o755);

  runGit(repoDir, ['add', '.']);
  runGit(repoDir, ['commit', '--quiet', '--message', 'initial']);
  runGit(repoDir, ['remote', 'add', 'origin', originDir]);
  runGit(repoDir, ['push', '--quiet', 'origin', 'main']);
  if (live) runGit(repoDir, ['worktree', 'add', '--quiet', '-b', 'live', liveDir, 'main']);

  mkdirSync(stubBinDir);
  const pnpmPath = path.join(stubBinDir, 'pnpm');
  writeFileSync(
    pnpmPath,
    [
      '#!/usr/bin/env bash',
      'echo "pnpm $*|$PWD" >> "$SYNC_LIVE_LOG"',
      'if [[ -n "${STUB_PNPM_FAIL_ON:-}" && " $* " == *" $STUB_PNPM_FAIL_ON "* ]]; then exit 1; fi',
      '',
    ].join('\n'),
  );
  chmodSync(pnpmPath, 0o755);

  return { baseDir, cliDir, liveDir, logPath, originDir, repoDir, stubBinDir };
}

/**
 * Commits to main in a separate clone of the fixture's origin and pushes it, as another machine would, and returns the
 * new commit's SHA; the fixture's own main is left behind origin/main.
 */
function pushFromOtherClone(fixture: Fixture, message: string): string {
  const otherDir = path.join(fixture.baseDir, 'other');
  if (!existsSync(otherDir)) runGit(fixture.baseDir, ['clone', '--quiet', fixture.originDir, otherDir]);
  runGit(otherDir, ['pull', '--quiet', '--ff-only']);
  runGit(otherDir, ['commit', '--allow-empty', '--message', message]);
  runGit(otherDir, ['push', '--quiet', 'origin', 'main']);
  return readHead(otherDir);
}

/** Reads the SHA to which a local branch points. */
function readBranchHead(dir: string, branch: string): string {
  return execFileSync('git', ['-C', dir, 'rev-parse', `refs/heads/${branch}`], { encoding: 'utf8' }).trim();
}

/** Reads the deploy steps recorded by the stubs, one `<command>|<cwd>` entry per step. */
function readDeployLog(fixture: Fixture): string[] {
  if (!existsSync(fixture.logPath)) return [];
  return readFileSync(fixture.logPath, 'utf8').trim().split('\n');
}

/** Reads the SHA at HEAD in a worktree. */
function readHead(dir: string): string {
  return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

/** Runs git in a directory with a fixed identity and signing disabled. */
function runGit(dir: string, args: string[]): void {
  execFileSync(
    'git',
    ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args],
    { stdio: 'pipe' },
  );
}

/** Runs the fixture's copy of the script from the base directory, with the stub pnpm first on `PATH`. */
function runSyncLive(fixture: Fixture, args: string[] = [], env: Record<string, string> = {}) {
  // Keep the developer's own override from redirecting the fixture's CLI lookup.
  const { CODEASSEMBLY_LIVE_DIR: _ignored, ...inheritedEnv } = process.env;
  return spawnSync(path.join(fixture.repoDir, 'scripts', 'codeassembly-sync-live.sh'), args, {
    cwd: fixture.baseDir,
    encoding: 'utf8',
    env: {
      ...inheritedEnv,
      PATH: `${fixture.stubBinDir}${path.delimiter}${process.env['PATH'] ?? ''}`,
      SYNC_LIVE_LOG: fixture.logPath,
      ...env,
    },
  });
}

// endregion | Helpers
