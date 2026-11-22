/** The git adapter for the shared helpers: every git invocation that they make, with its parsing. */
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isRecord } from '../lib/type-guards.ts';

/** The git queries that the shared helpers make, each returning parsed values. */
export interface SharedGit {
  /** Returns the checked-out branch name, or an empty string on a detached HEAD. Throws when git fails. */
  findCurrentBranch(cwd: string): Promise<string>;
  /** Returns the named remote's fetch URL, or undefined when git reports an empty one. Throws when git fails. */
  findRemoteUrl(cwd: string, name: string): Promise<string | undefined>;
  /** Returns the working-tree root containing `startDir`, or git's own diagnostic when it cannot supply one. */
  findTopLevel(startDir: string): TopLevelResult;
  /** Returns the remote names in the order that git lists them. Throws when git fails. */
  listRemotes(cwd: string): Promise<string[]>;
  /** Returns the value of a git config key, or undefined when the key is not set. Throws when git fails otherwise. */
  readConfig(cwd: string, key: string): Promise<string | undefined>;
  /** Removes a git config key; a key that is not set is left as it is. Throws when git fails otherwise. */
  unsetConfig(cwd: string, key: string): Promise<void>;
  /** Sets a git config key in the repository's local config. Throws when git fails. */
  writeConfig(cwd: string, key: string, value: string): Promise<void>;
}

/** The git working-tree root, or the diagnostic produced by git when it could not supply one. */
export type TopLevelResult = { readonly root: string } | { readonly failure: string };

/** The adapter that runs git. */
export const realGit: SharedGit = {
  findCurrentBranch,
  findRemoteUrl,
  findTopLevel,
  listRemotes,
  readConfig,
  unsetConfig,
  writeConfig,
};

// region | Helpers

const execFileAsync = promisify(execFile);

/** The exit code of `git config --get` for a key that is not set. */
const CONFIG_KEY_NOT_SET = 1;

/** The exit code of `git config --unset` for a key that is not set. */
const CONFIG_UNSET_KEY_NOT_SET = 5;

/** Extracts git's own message from a failed `execFileSync` call, falling back to the thrown error's own text. */
function describeGitFailure(error: unknown): string {
  const stderr = isRecord(error) ? error['stderr'] : undefined;
  if (typeof stderr === 'string' && stderr.trim() !== '') {
    return stderr.trim();
  }
  return describeError(error);
}

/** Runs `git branch --show-current`, which prints an empty line on a detached HEAD. */
async function findCurrentBranch(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, 'branch', '--show-current']);
  return stdout.trim();
}

/** Runs `git remote get-url` for the named remote. */
async function findRemoteUrl(cwd: string, name: string): Promise<string | undefined> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, 'remote', 'get-url', name]);
  const url = stdout.trim();
  return url === '' ? undefined : url;
}

/** Runs `git rev-parse --show-toplevel`, capturing stderr so that a failure can quote git. */
function findTopLevel(startDir: string): TopLevelResult {
  try {
    const stdout = execFileSync('git', ['-C', startDir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const root = stdout.trim();
    return root === '' ? { failure: 'git returned an empty working-tree root' } : { root };
  } catch (error) {
    return { failure: describeGitFailure(error) };
  }
}

/** Runs `git remote`, which prints one remote name per line. */
async function listRemotes(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, 'remote']);
  return stdout
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

/** Runs `git config --get`, which exits 1 when the key is not set. */
async function readConfig(cwd: string, key: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, 'config', '--get', key]);
    return stdout.trim();
  } catch (error) {
    if (readExitCode(error) === CONFIG_KEY_NOT_SET) {
      return undefined;
    }
    throw error;
  }
}

/** Returns the exit code of a failed `execFile` call, or undefined when the process did not exit with one. */
function readExitCode(error: unknown): number | undefined {
  const code = isRecord(error) ? error['code'] : undefined;
  return typeof code === 'number' ? code : undefined;
}

/** Runs `git config --unset`, which exits 5 when the key is not set. */
async function unsetConfig(cwd: string, key: string): Promise<void> {
  try {
    await execFileAsync('git', ['-C', cwd, 'config', '--unset', key]);
  } catch (error) {
    if (readExitCode(error) !== CONFIG_UNSET_KEY_NOT_SET) {
      throw error;
    }
  }
}

/** Runs `git config --local` to set the key. */
async function writeConfig(cwd: string, key: string, value: string): Promise<void> {
  await execFileAsync('git', ['-C', cwd, 'config', '--local', key, value]);
}

// endregion | Helpers
