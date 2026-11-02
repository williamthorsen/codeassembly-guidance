# Deploying guidance from the live worktree

On a CodeAssembly developer's machine, the deployed guidance comes from this repository's worktree checked out on the `live` branch (`~/repos/projects/codeassembly-guidance.live` beside the main worktree). `codeassembly-sync-live` fast-forwards `live` to a commit and deploys from it in one command.

## Setup

The command deploys with the `codeassembly` CLI built in the `live` worktree of [williamthorsen/codeassembly](https://github.com/williamthorsen/codeassembly). It looks for that worktree at `codeassembly.live` beside this repository's worktrees (`~/repos/projects/codeassembly.live`), or at the path that `CODEASSEMBLY_LIVE_DIR` names.

Link the command onto `PATH` once:

```bash
ln -s ~/repos/projects/codeassembly-guidance.live/scripts/codeassembly-sync-live.sh ~/.local/bin/codeassembly-sync-live
```

The link points into the `live` worktree, so the command updates itself whenever `live` advances.

## Usage

```bash
codeassembly-sync-live            # advance live to origin/main and deploy
codeassembly-sync-live 5bab2e28   # advance live to a specific commit and deploy
```

The command runs from any directory. It fetches `origin` and fast-forwards `live` to the commit. It then installs dependencies and builds in the `live` worktree and in the CodeAssembly `live` worktree, and deploys with the CodeAssembly worktree's `codeassembly install` and `codeassembly sync --global`. It never fetches or advances the CodeAssembly worktree, which is advanced on its own.

It refuses, leaving `live` unchanged, when the CodeAssembly worktree is missing, when the ref is unknown, when `live` cannot fast-forward, or when the `live` worktree has uncommitted changes. When a deploy step fails after `live` has advanced, rerunning the command completes the deploy. `codeassembly-sync-live --help` lists the exit codes.

## Why it deploys from a live worktree's build

A developer deploys the code on `live`, not the published `codeassembly` package, so the command runs the CodeAssembly `live` worktree's own binary rather than one found on `PATH`, through `npx`, or pinned by this repository. A CLI change then reaches the machine once that worktree advances. That binary is also the one that a [`home-writer`](https://github.com/williamthorsen/codeassembly/blob/main/packages/agents/docs/project-declaration.md#designated-home-domain-writer) setting designates, and the home-domain provenance records its version and commit.

Because the command passes `--link` to `install`, the deployed scripts point into the `live` worktree and follow it between installs.

Consumers of CodeAssembly do not need this command: They deploy with `npx codeassembly install` and `npx codeassembly sync --global`, as the [agents README](https://github.com/williamthorsen/codeassembly/blob/main/packages/agents/README.md) describes.
