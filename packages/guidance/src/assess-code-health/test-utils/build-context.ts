import type { TrackedDependencies } from '../check-tracked.ts';
import type { CommandContext } from '../cli.ts';
import { realSenseDependencies, type SenseDependencies } from '../sense.ts';

/**
 * Builds a command context that runs real git and checks, whose third-party tools fail to spawn, and whose tracker
 * dependencies throw, unless the test replaces them.
 */
export function buildContext(
  root: string,
  overrides: { sense?: Partial<SenseDependencies>; tracked?: Partial<TrackedDependencies> } = {},
): CommandContext {
  return {
    root,
    sense: {
      ...realSenseDependencies,
      runTool: (command) => ({ spawnError: `${command} must not run` }),
      ...overrides.sense,
    },
    tracked: {
      run: () => Promise.reject(new Error('gh must not run')),
      changedSince: () => {
        throw new Error('git must not run');
      },
      readFile: () => {
        throw new Error('no file may be read');
      },
      ...overrides.tracked,
    },
  };
}
