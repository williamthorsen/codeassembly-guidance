---
slug: cross-repo-migration-conventions
description: 'A migration that spans repositories, such as a move to a new runtime version or convention: one umbrella ticket with a child per repository, shared runtimes moved first, the umbrella''s comments as the ledger of lessons, contract changes decided before any child acts, and what each child reads, posts, and verifies. Consult before creating an umbrella ticket for such a migration, or a child of one.'
delivery: [skill]
version: '1'
---

# Cross-repo migration conventions

A migration that spans repositories moves each repository to the same new version or convention, such as a runtime upgrade. The ticketing preferences already give each repository its own ticket and record the order as blocked-by relations, upstream first; the rules below add what such a migration needs beyond that.

## The umbrella

- **Children.** The umbrella has one child per repository, linked as a sub-issue, and "Every child is closed" as its acceptance criterion.
- **Shared runtimes first.** A runtime that several repositories use, such as a reusable CI workflow, a shared host that runs checks, or the toolchain installed on each machine, is upstream of every repository that uses it, and its child blocks theirs. When the shared runtime can read each repository's pin, as a reusable workflow can, its child makes it do so, and each repository then moves with its own child. A runtime with one version for every repository, such as a shared host, moves every repository that uses it, including those that have not moved yet; the child that moves it states so on the ledger.
- **The ledger.** The umbrella's comments record what each child found. A ticket is readable and writable from a session in any repository, so the ledger does not need a branch in a shared repository, and a comment can be added after the umbrella's body is frozen by the start of work. The body states the plan; the comments state what the plan met.
- **Per-machine steps.** A step that each machine needs follows [who applies the change](../../skills/_data/design-priorities.md#who-applies-the-change). When it reaches the script rung, post the script on the ledger as well as committing it, and open a ticket for each machine that has not run it.

## Contract changes

The umbrella decides a step that changes a published contract, such as a package's supported runtime floor, before any child acts on it: It states the problem that the step solves, weighs a step that keeps the contract against it, such as testing the claim that the floor makes, and counts the consumers outside the migrated repositories as well as those inside. A contract change found wrong after children have executed it costs a revert in each repository that executed it, and a release for each one that published it. When the umbrella reverses such a decision, it closes the children not yet done as not planned and adds the reverts as children.

## Each child

- **Before the work.** The child reads the ledger, and its `## Context` names the lessons that apply to its repository and those that do not, with the fact that rules each one out.
- **The ledger comment.** The child posts its comment before merge, naming its pull request: Merging closes the child, and the session that merges ends there, so a comment due after merge is the one that gets skipped. The comment states what broke and how it was fixed, or that nothing did, and each fact on which a later repository can act. The comment leaves out the lessons that did not apply, because the child's `## Context` already records them. A fact learned after merge goes in a later comment. A rollout step that follows the merge as planned is named in the comment with its command, and a later comment reports its result. A comment that narrows or corrects an earlier lesson links to the comment that it revises.
- **Verification.** Each check that the comment reports names the runtime on which it ran. A check delegated to a shared host runs on that host's runtime, which may not be the version that the repository pins; a child verifying its own move runs the check where that version is installed, or relies on CI that installs it.
