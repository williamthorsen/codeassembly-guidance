/** Reads and writes the diff base that a branch stores in its git config, for the session-context deriver. */
import process from 'node:process';

import type { SharedGit } from '../shared/git.ts';

/** A request to set or clear the branch's stored diff base. */
export interface DiffBaseMutation {
  readonly value: string | null;
}

/**
 * Applies the diff-base mutation to the branch's git config key and returns the key's value. On the default branch,
 * which is not a piece of any split, a set is refused with a stderr report and the value is null. A git failure while
 * reading yields null, as an unresolvable remote does.
 */
export async function resolveDiffBase(input: {
  git: SharedGit;
  cwd: string;
  branchName: string;
  isDefaultBranch: boolean;
  mutation: DiffBaseMutation | undefined;
}): Promise<string | null> {
  const { git, cwd, branchName, isDefaultBranch, mutation } = input;
  if (isDefaultBranch) {
    if (mutation?.value !== undefined && mutation.value !== null) {
      process.stderr.write(`derive-session-context: refusing to store diff_base on default branch ${branchName}\n`);
    }
    return null;
  }
  const key = `branch.${branchName}.${DIFF_BASE_CONFIG_NAME}`;
  if (mutation !== undefined) {
    await (mutation.value === null ? git.unsetConfig(cwd, key) : git.writeConfig(cwd, key, mutation.value));
  }
  try {
    return (await git.readConfig(cwd, key)) ?? null;
  } catch {
    return null;
  }
}

// region | Helpers

/** The variable name, under a branch's `branch.<name>` config section, that stores the branch's diff base. */
const DIFF_BASE_CONFIG_NAME = 'codeassemblyDiffBase';

// endregion | Helpers
