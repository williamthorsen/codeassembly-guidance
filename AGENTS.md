# CodeAssembly guidance repository

## Repository visibility

This repository is public. Anything committed here is world-readable, so it must not contain any credential, personal detail, or workplace-internal fact.

## Packages

A pnpm workspace holding the guidance library that the `codeassembly` CLI deploys.

- **guidance** (`packages/guidance/`): The `codeassembly-guidance` library of rulebooks, skills, and subagents, with the helpers that its skills run. See `packages/guidance/README.md`.

The `codeassembly` CLI, `codeassembly/api`, and `@williamthorsen/kb` live in [williamthorsen/codeassembly](https://github.com/williamthorsen/codeassembly), and this repository consumes them from npm at the versions that `pnpm-workspace.yaml` and `packages/guidance/package.json` pin. A guidance change that needs a change to one of them waits for that package's release there, then upgrades the pin here.

## Content authoring

When authoring a skill, subagent, rulebook, or collection, consult `packages/guidance/content/guidance/rulebooks/codeassembly-content-specification.md` (the `consult-codeassembly-content-specification` skill) for the contract that any content root follows, and `.agents/content/guidance/rulebooks/codeassembly-repo-conventions.md` (the `consult-codeassembly-repo-conventions` skill) for the conventions that apply to the library in this repository.

Content appearing identically in two or more skill or subagent files belongs in a partial. The expander inlines partials at install time to byte-identical output, so they are the correct DRY mechanism even when verbatim execution context is a requirement. See `packages/guidance/content/_partials/README.md`.

## Deployment

A developer machine deploys guidance from this repository's `live` worktree with `codeassembly-sync-live`; see `docs/live-deployment.md`.

## Gotchas

- `pnpm run bootstrap` builds the package, then deploys current guidance into the worktree's harness directories. `pnpm run agents:sync` does the deploy half alone.
- The helper bundles under `packages/guidance/content/` are tracked build output, so a helper edit is committed together with its rebuilt bundle. `nmr build` regenerates them, and `nmr check:strict` fails on a bundle that is stale or not produced by any helper declared in `packages/guidance/content/codeassembly-content.yaml`. A bundle that embeds `package.json` changes whenever the manifest does.
- `packages/guidance/content/skills/_data/work-types.json` is also build output, written from `@williamthorsen/change-grammar`'s `CANONICAL_TAXONOMY`. Change a work type in that package, not in the file. The same build regenerates the file, and `nmr check:strict` fails on a stale copy.
- `packages/guidance/content/_partials/kb-standard-tags.md` is also build output, written from `@williamthorsen/kb`'s `STANDARD_TAGS`. Change a standard tag in that package, not in the partial. The same build regenerates the partial, and `nmr check:strict` fails on a stale copy.
- Deleting `dist/` does not force a rebuild. Because the `nmr-compile` cache is in `node_modules/.cache/nmr-compile/` and is keyed on inputs alone, the rebuild skips and leaves `dist/` empty. Clear the cache too. Tracked upstream at williamthorsen/node-monorepo-tools#470.
- A package has a `vitest.config.ts` only when it configures something of its own; every other package runs against the repo-root config, which nmr's `nmr-vitest` names with `--config` because Vitest 5 doesn't look in parent directories. A bare `vitest` started from such a package needs the same flag; see `node_modules/@williamthorsen/nmr/docs/vitest.md`. The repository's own root-level tests, such as those under `scripts/__tests__/`, run against `vitest.root.config.ts`.
- Because the root `tsconfig.json` names `"types": ["node"]`, every package declares `@types/node` as `catalog:`. TypeScript 6 doesn't include any ambient `@types` package automatically, and naming one here excludes the rest: An `@types/*` supplying globals doesn't take effect until that list includes it.
- Every package's `eslint.config.ts` extends the repo-root `eslint.config.ts`, which contains the `import-x/resolver-next` settings that `eslint-plugin-import-x` reads. A config importing `@williamthorsen/eslint-config-typescript` directly still runs `import-x/extensions` at `error`, but with nothing to resolve against, the rule accepts a `.js` specifier naming a `.ts` file.
- Use exact dependency versions in `package.json`, without `^` or `~` range indicators. A dependency shared by two or more manifests is pinned once in `pnpm-workspace.yaml`'s `catalog:` block, with every consumer declaring `catalog:`. Taking on a cataloged dependency means declaring `catalog:`, never re-pinning the literal.
- `pnpm-workspace.yaml` applies pnpm's 24-hour `minimumReleaseAge` to every package except those that its `minimumReleaseAgeExclude` names, the ones that williamthorsen/codeassembly publishes. `nmr upgrade` proposes a release once it clears that age. `nmr upgrade --maturity-period <days>` sets one period for every dependency for that call; a period below 1 day also needs `pnpm --config.minimum-release-age=0 install`, because pnpm otherwise refuses a release younger than 24 hours.
- Prettier here formats shell scripts and Dockerfiles, so `nmr fmt` covers them and the repo doesn't run a separate `shfmt` step.
- History before 2026-10-03 shows the library under `packages/agents/`, its home before it became its own package; `git log --follow` traces a file across the move. Commit titles in that history reference issues of williamthorsen/codeassembly, not of this repository.
