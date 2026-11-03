# Deploying guidance with codeassembly-sync-live

`codeassembly-sync-live` fast-forwards a branch of this repository to a commit and deploys guidance from it in one command. It runs in one of two modes, chosen by whether the clone has a `live` worktree: A developer machine deploys from its `live` worktree, and a consumer machine deploys from its main clone on `main`. A clone that has a `live` branch but no worktree checking it out is refused, with the command that creates the worktree.

In either mode, the command runs from any directory. It fetches `origin`, fast-forwards the branch to the commit (`origin/main` by default), installs dependencies and builds, then runs `codeassembly install --link` and `codeassembly sync --global`. It refuses, leaving the branch unchanged, when the ref is unknown, when the branch cannot fast-forward, or when the worktree has uncommitted changes. When a deploy step fails after the branch has advanced, rerunning the command completes the deploy. `codeassembly-sync-live --help` lists the exit codes.

```bash
codeassembly-sync-live            # advance the branch to origin/main and deploy
codeassembly-sync-live 5bab2e28   # advance the branch to a specific commit and deploy
```

## Developer machine

The deployed guidance comes from this repository's worktree checked out on the `live` branch (`~/repos/projects/codeassembly-guidance.live` beside the main worktree), and the command advances `live`.

### Setup

The command deploys with the `codeassembly` CLI built in the `live` worktree of [williamthorsen/codeassembly](https://github.com/williamthorsen/codeassembly). It looks for that worktree at `codeassembly.live` beside this repository's worktrees (`~/repos/projects/codeassembly.live`), or at the path that `CODEASSEMBLY_LIVE_DIR` names.

Link the command onto `PATH` once:

```bash
ln -s ~/repos/projects/codeassembly-guidance.live/scripts/codeassembly-sync-live.sh ~/.local/bin/codeassembly-sync-live
```

The link points into the `live` worktree, so the command updates itself whenever `live` advances.

### Behavior

After advancing `live`, the command installs dependencies and builds in the `live` worktree and in the CodeAssembly `live` worktree, and deploys with the CodeAssembly worktree's `codeassembly install` and `codeassembly sync --global`. It never fetches or advances the CodeAssembly worktree, which is advanced on its own. It also refuses, leaving `live` unchanged, when the CodeAssembly worktree is missing.

### Why it deploys from a live worktree's build

A developer deploys the code on `live`, not the published `codeassembly` package, so the command runs the CodeAssembly `live` worktree's own binary rather than one found on `PATH`, through `npx`, or pinned by this repository. A CLI change then reaches the machine once that worktree advances. That binary is also the one that a [`home-writer`](https://github.com/williamthorsen/codeassembly/blob/main/packages/agents/docs/project-declaration.md#designated-home-domain-writer) setting designates, and the home-domain provenance records its version and commit.

Because the command passes `--link` to `install`, the deployed scripts point into the `live` worktree and follow it between installs.

## Consumer machine

A machine that consumes guidance without developing it keeps a clone of this repository on `main` at `~/repos/projects/codeassembly-guidance`, without a `live` worktree or a `live` branch, and the command advances `main` in that clone's main worktree.

### Setup

Link the command onto `PATH` once:

```bash
ln -s ~/repos/projects/codeassembly-guidance/scripts/codeassembly-sync-live.sh ~/.local/bin/codeassembly-sync-live
```

The link points into the main clone, so the command updates itself whenever `main` advances.

### Behavior

After advancing `main`, the command installs dependencies and builds in the main worktree, and deploys with the `codeassembly` CLI that this repository pins: the `codeassembly` entry of the root `package.json`, whose version `pnpm-workspace.yaml`'s catalog sets. The machine therefore runs the CLI version that this repository builds and checks against, and receives a newer one when the pin is raised. It does not need a clone of williamthorsen/codeassembly, and it ignores `CODEASSEMBLY_LIVE_DIR`.

It also refuses, leaving `main` unchanged, when the main worktree is not on `main`. Because the command passes `--link` to `install`, the deployed scripts point into the main clone, so the clone stays on `main`.
