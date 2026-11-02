<!-- readme-type: monorepo-root -->

# CodeAssembly guidance

The CodeAssembly library of agent guidance (rulebooks, skills, and subagents) that the [`codeassembly`](https://github.com/williamthorsen/codeassembly) CLI deploys into agent harnesses.

```bash
pnpm install && pnpm run bootstrap
```

## Packages

| Package                                       | Description                                              |
| --------------------------------------------- | -------------------------------------------------------- |
| [`codeassembly-guidance`](packages/guidance/) | The guidance library and the helpers that its skills run |

## Deploying from a clone

A developer machine deploys guidance from this repository's `live` worktree; see [Deploying guidance from the live worktree](docs/live-deployment.md).

## For AI agents

See [`AGENTS.md`](AGENTS.md).
