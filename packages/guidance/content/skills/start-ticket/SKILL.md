---
name: start-ticket
description: Open the work in a ticket's worktree by choosing the entry-point skill from the ticket's state and its artifacts, and invoking it
user-invocable: true
---

# Start ticket

Open the work in a ticket's worktree with one fixed prompt. The skill resolves the ticket, reads its state and the artifacts in its ticket directory, chooses the skill that opens the work per [entry points](../_data/entry-points.md), and invokes that skill. It re-resolves everything from the environment, so a session started with it does not need a prompt written by an earlier session.

## Arguments

- Ticket source (optional): Issue URL, shorthand reference (`#99`), or file path. It overrides the ticket that the branch encodes.

## Process

1. **Get context**: Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash, and read `branch_name`, `ticket_id`, `ticket_ref`, `ticket_url`, `pr_url`, `project_slug`, and `artifact_base_dir` from the manifest JSON that it emits.

2. **Resolve the ticket** from the argument, or else by [auto-resolve](../_data/ticket-source-resolution.md#auto-resolve), requesting the ticket's state with its content. When the argument is absent and `ticket_id` is null, as on the default branch, say that the branch does not encode a ticket and ask for the ticket ref. Never guess a ticket from the branch's commits, the artifact directory, or the backlog. When the source resolves to a URL, persist it per [Stored ticket URL](../_data/ticket-source-resolution.md#stored-ticket-url), and report the ticket's open blockers per [Open blockers](../_data/ticket-source-resolution.md#open-blockers). A blocker does not stop the choice; the skill that opens the work decides what it means.

3. **Choose the entry point** by checking the routes of [entry points](../_data/entry-points.md) in order against the ticket, the branch's pull request, and the ticket directory. Stop at the first match.

4. **Announce** the route in one line: the skill, the reason that the route states, and, when the route names a plan, its path and timestamp. The announcement is how the developer catches a wrong route or a superseded plan before the chosen skill acts.

5. **Invoke the chosen skill** with the arguments that the route names, without asking first: The route is a determination under the rule, not a choice. A route that stops ends the run with its report. Do not repeat a check that the invoked skill makes itself, such as the blocker confirmation and the branch-currency check of {skill?:implement-plan} and {skill?:investigate-spike}.

<!-- include: ../_partials/action-items.md / -->
