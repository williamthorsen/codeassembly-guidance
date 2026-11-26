---
slug: williamthorsen-workflow-preferences
description: William Thorsen's personal preferences for how work moves -- scope, branches and worktrees, guidance capture, and the arc of product development.
delivery: ambient
version: '18'
---

# William Thorsen's workflow preferences

## Workflow

- Do not treat a question as an instruction: When the user asks a question or voices a doubt, answer it and end the turn. The collaborate skill's "Questions end the turn" section states the rule.
- Treat a ticket as a signal, not a boundary: When work appears that the ticket didn't name, fold it into the current change by default; spin off a separate ticket only for an affirmative reason beyond the ticket's silence, and when you do, create it immediately rather than leaving it in the conversation. Recommend the scope call and build on it: Present a fold-in as provisional at the ticket checkpoint, and ask before creating a spin-off, because it creates remote state. Full doctrine: [scope-and-deferral.md](../../skills/_data/scope-and-deferral.md).
- Make changes through branches and pull requests, not by editing the default branch directly.
- When feedback should change how the agent behaves and generalizes beyond the current task, capture it via {skill:capture-feedback}. The capture records evidence for a later refinement pass; it does not change any behavior until that pass writes the lesson into guidance and the guidance is deployed. Do not record generalizable guidance as a per-project memory.
- Reserve memories for genuinely local, non-propagating facts (a project-specific deadline or quirk): A memory is scoped to a single project on a single machine, so recording generalizable guidance in one fragments behavior across contexts.

## Branch and worktree management

Never create a branch or worktree without explicit authorization. Each ticket is implemented in its own worktree, and the developer's tooling relies on that: Do all of one ticket's work in that worktree, never switch a worktree to another branch, and start a new session in another ticket's own worktree for work on that ticket. Which branch or worktree a ticket's work uses is settled, so never ask it.

When telling the developer how to start or resume a ticket's work in a fresh session, name `start-ticket`, invoked without arguments in the ticket's worktree, and never name another entry skill, such as `plan` or `implement-plan`, for that purpose; a next-steps menu within a session names its own skills. When an interactive session writes or refines the ticket of its own branch outside a skill that closes with its own next-steps menu, end that turn with an offer to invoke `start-ticket`.

Create an authorized worktree with Worktrunk, never with `git worktree add`, because Worktrunk runs the repository's setup hooks, such as `direnv allow` and `pnpm install`, and a worktree made by plain `git` lacks that setup: `wt switch --create <branch>` for a new branch, and `wt switch <branch>` for an existing one. Do not pass a path, because Worktrunk's path template places the worktree. Do not pass `--yes`, which approves the project's hook commands on the developer's behalf: When Worktrunk asks for approval, ask the developer.

A session works only in its own repository and in its own ticket's worktree. For any other repository or ticket, filing the ticket is the limit of the session's work: Do not create a branch or a worktree there, commit, push, or open a pull request. Reading another repository is not restricted. A request from the developer for that work in this session governs, but a request to file a ticket does not ask for the ticket's work.

When a session works in its own ticket's worktree and that worktree is not its cwd, pass that worktree to every skill that takes a working directory, such as `create-commit`, or commit inline with `git -C`: A skill with `context: fork` starts in the session's cwd, and the skill listing does not show which skills fork.

After a merge, say nothing about worktree or branch state and never offer to manage it. The worktree stays as long as its branch does, so there is nothing to clean up and nothing to ask about.

## Cross-repo sequencing

When the work would be better done upstream, in a package or repository on which this one depends, default to upstream first: File the upstream ticket and record it as a blocker of this one, and make the downstream change once the upstream change is merged and published and the dependency is upgraded here. The upstream change belongs to the upstream ticket's own session. Propose that order rather than merging a downstream workaround ahead of it.

Downstream first reads as faster because something is merged sooner, but it requires two downstream changes rather than one: the workaround, then its removal once the upstream change is merged. It also forces upstream to decide without the downstream requirement in hand, so upstream cannot weigh that requirement against its own constraints, and may settle on a shape that the consumer keeps working around.

Let a condition displace the default: an upstream that is unowned, unresponsive, or on a release cadence that will not accommodate the work. When one applies, name it, recommend the order, build on the recommendation, and leave the veto to the developer.

## Product development

When the developer starts a product, move the work through these stages in order, each producing one thing. Skip a stage when the product is small enough that its output is already obvious, and say which stage and why.

1. Idea: Write the idea back to the developer and record it in the design doc.
2. Opinions: Evaluate the idea from other roles and record the evaluations with it.
3. Brief: Flesh the idea out into a brief for a prototype round.
4. Prototypes: Build competing prototypes of a rich feature set through `prepare-prototype-brief`, judge them through `index-prototypes`, decide every idea in the round's idea table through `prepare-prototype-brief`, and synthesize the prototypes through `refine-prototype`, which transfers the kept and adapted ideas to the winner, applies the developer's commands at sketch speed, and records each accepted change in a `refinement-log` artifact. A verdict on a prototype does not decide its ideas: Each idea is kept, adapted, deferred, or dropped by the developer's answer. Prototyping a rich feature set is how the product that could emerge becomes visible, so run the round before writing the vision.
5. End vision: Write the purpose, the non-goals, the project's declared stage (maturity, sensitivity, and audience), the decisions with their reasons, and a rough structure from what the prototypes taught, citing the round's `idea-decisions` and `refinement-log` artifacts, and get the developer's approval. Record every decision on an idea in the design doc, so that a later session sees why an idea is absent.
6. MVP: Build the smallest product that does the product's one job. Put a prototype feature in it when the product cannot do that job without the feature, and leave the rest for increments.
7. Increments: Add features one iteration at a time.

Treat the winning prototype as the baseline: the floor on quality and feel against which the finished product is judged, and the reference for what the product does and how it is put together. Read it as evidence of the vision rather than as its specification: Let its structure inform the design doc, and expect to improve on it.

Hold the finished product to the baseline, not any one iteration. An iteration may omit a prototype feature or deliver it in a reduced form; treat a reduction as remaining work and give it a one-line sub-issue, which keeps the gap visible. When settling a feature below the prototype's bar or retiring it, record the decision in the design doc with its reason.

Write a ticket in detail when its work is about to be implemented. Until then, keep each artifact to one tier:

- Keep the vision in a design doc in the repo: the purpose, the non-goals, the declared stage, the decisions with their reasons, and the rough structure. Put a statement there when reversing it later would invalidate completed work, or when a new session needs it to choose a direction, and leave most other detail to its iteration.
- Have the epic point to the design doc, state what is out of scope, and list the iterations as its sub-issues in order. Keep the vision out of the epic's body, because a ticket's body is frozen once its work starts and the vision is not.
- Use the milestone to mark the current iteration, which `pull-from-backlog` reads as the Now set.
- Treat the prototype as the baseline.
- Make each iteration a sub-issue of the epic, and create every iteration's sub-issue when the epic is created rather than as each iteration starts. Specify the current iteration in detail. Write each later one as a one-line outcome, what the user can newly do, rather than as a feature, and refine it against the design doc when its iteration starts.

Once the developer approves the end vision, propose that shape rather than drafting every ticket in detail up front.

Expect the vision to change. At the end of each iteration, re-read the design doc, revise what the iteration disproved, and refine the next sub-issue against the revised doc. The documents exist so that a new session knows the vision without being told. Within an iteration as well as at its end, weigh the design doc as evidence rather than authority, per [records are evidence](../../skills/_data/ticket-evaluation.md#records-are-evidence).
