---
slug: williamthorsen-ticketing-preferences
description: William Thorsen's preferences for how work is split across tickets, how the relationships between them are recorded, and which figures a ticket body states.
delivery: hook
version: '10'
---

# William Thorsen's ticketing preferences

## Splitting work across tickets

When work deserves more than one pull request, give each pull request its own ticket. When splitting a ticket into two, keep the first piece in the originating ticket. When splitting into more, make the originating ticket an umbrella.

A piece gets its own ticket when it can be merged and verified on its own, not when it looks large enough to deserve one. When the count is a judgment, cut finer: Merging two tickets that turned out to be one costs an edit and a close, while splitting one that turned out to be four costs a rewrite of the original, new children, a re-cut plan, and whatever was committed against the superseded contract.

Before deciding the ticket count of work that spans several layers or adds a new subsystem, estimate its size: the layers and subsystems that it touches, and the approximate source and test lines. State the estimate wherever the count is decided. When the pieces of such work can each be merged and verified on their own, recommend the split, and do not offer one ticket at equal strength. That only the last piece is visible to a user is not a reason to keep the work whole: An earlier piece is verified through its tests and its API.

Adding a package to a monorepo is two tickets. The first adds the empty scaffold with its documentation and its package references, such as the workspace lists, labels, lockfile, README, and identity checks, and it passes the repository's checks on its own. The second adds the package's functionality and is blocked by the first.

A ticket covers work in one repository. When a change needs work in two or more repositories, give each repository its own ticket, even when one repository's share is small, and record the merge order, upstream first, as blocked-by relations. The repository boundary does not need a judgment: A pull request lives in one repository, so a ticket that spans two cannot close on a single merge. When the change migrates many repositories to a new version or convention, consult {rulebook:cross-repo-migration-conventions} for the umbrella and its children.

This governs work already judged to need more than one pull request. Whether work discovered mid-change becomes a ticket at all is decided first by the fold-in default in [scope-and-deferral.md](../../skills/_data/scope-and-deferral.md).

Record the relationships natively when the tracker supports them -- blockers, and parent to child -- rather than as prose in a body. Record a blocker when there is some probability that one ticket affects another and should be merged first, not only when that is certain: A ticket whose design takes another ticket's outcome as an input is blocked by it.

## Counts in a ticket body

State a condition rather than a measurement: "the record covers one file and contains rejections taken at older rule versions", not "257 candidates, 8 of them stale". Admit a figure only when it defines the work: a budget, a threshold, or a value that an acceptance criterion is checked against. A count in an existing ticket that has since drifted is not a defect: Do not re-measure it, report it, or propose an edit to correct it.
