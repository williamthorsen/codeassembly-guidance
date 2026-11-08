# Entry points

The skill that opens the work in a ticket's worktree follows from the ticket's state and the artifacts in its ticket directory. This file states that rule once; {skill?:start-ticket} applies it when a session starts, and the split report of every plan skill names that skill rather than choosing an entry point of its own.

## Inputs

- **The ticket's state**: open or closed, from the platform fetch in [ticket source resolution](ticket-source-resolution.md#platform-specific-fetch).
- **The branch's pull request**: `pr_url` from the session-context manifest, or else the pull request whose head is `branch_name` in any state (on GitHub, `gh pr list --head {branch_name} --state all --json url,state`). `pr_url` is usually null on a ticket branch, so the lookup is the common case.
- **The ticket directory**: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`, and the artifact types that [artifact conventions](artifact-conventions.md) defines. The newest plan is the one that the plan resolution of {skill?:implement-plan} selects (its [process](../implement-plan/SKILL.md#process), step 2): the greatest filename prefix across `*_plan.md` and `*_plan-v*.md`, never `*_plan-review.md`. The newest artifact of any other type is the one with the greatest filename prefix.

## Routes

Check the routes in order and stop at the first match. Each route names the skill, the arguments that it passes, and the reason that the announcement states.

1. **Done.** The ticket is closed, or the branch has a pull request that is open or merged: Stop, and report in one line `{ticket_ref} is {state}; PR {url} is {state}.`, with each clause only when it applies. A closed pull request that was not merged does not match, because the work may restart.

2. **Unsettled plan.** The newest plan contains a list entry inside its `## Decisions taken` section whose text starts with 🔲: {skill?:refine-plan} with the plan path and the ticket. Reason: the plan contains a decision that no checkpoint approved. A 🔲 elsewhere in the plan, or one that a decision mentions rather than starts with, does not match.

3. **Spike.** The ticket body, in its newest ticket artifact or on the platform, contains the `## Question` section and the `### Questions to answer` tier of the [spike ticket template](spike-conventions.md#spike-ticket-template), or the newest plan contains `## Investigation steps`:
   - The ticket directory contains a `dispositions` artifact, which {skill?:triage-spike-findings} saves once its last write succeeds: Stop, and report the findings artifact and the dispositions. The spike is finished.
   - The ticket directory contains `triage/dispositions.json` without a `dispositions` artifact: {skill?:triage-spike-findings} with the findings path, which resumes the interrupted triage from that record.
   - A `spike-findings` artifact newer than the plan proposes work, judged by reading it with the test of {skill?:investigate-spike} step 8: {skill?:triage-spike-findings} with the findings path.
   - A `spike-findings` artifact newer than the plan does not propose any work: Stop, and report it, with the closing post as the step that remains, which {skill?:investigate-spike} offers.
   - The newest plan is a spike plan: {skill?:investigate-spike} with `--plan={path}` and `--ticket={ticket_ref}`.
   - Otherwise: routes 5c and 5d, with `as a spike` after the ticket ref. That phrase is the explicit entry into spike mode that [spike conventions](spike-conventions.md) requires.

4. **Prototype round.** The ticket directory contains a prototype set (`prototypes/manifest.json`, per [the set](../index-prototypes/SKILL.md#the-set)), or a `brief`, `comparison`, `idea-decisions`, or `refinement-log` artifact, or the ticket calls for two or more competing prototypes of one idea, judged by reading it:
   - A `refinement-log` artifact: {skill?:design-and-plan} with the ticket ref, for the end vision and the ticket. {skill?:refine-prototype} saves the log when the refinement closes, so the log marks the refinement as done.
   - An `idea-decisions` artifact that is newer than the newest `comparison` and does not contain an `open` row: {skill?:refine-prototype}.
   - A `comparison` artifact, with an `idea-decisions` artifact newer than it that contains an `open` row, or none newer than it: {skill?:prepare-prototype-brief} with the ticket ref and the scope note `decide the ideas (step 7)`.
   - Otherwise: {skill?:prepare-prototype-brief} with the ticket ref, adding the scope note `resume the round from the saved brief` when a `brief` artifact exists.

5. **Feature.**
   - a. Route 2 covers a plan that contains an unsettled decision.
   - b. Any other plan: {skill?:implement-plan} with `--plan={path}` and `--ticket={ticket_ref}`.
   - c. The ticket is ready: It states a problem, a proposed solution, and acceptance criteria, and applying [ticket evaluation](ticket-evaluation.md) does not find any divergence that needs a design conversation. This is a judgment, and the announcement states its reason. {skill?:plan} with the ticket ref.
   - d. Otherwise: {skill?:design-and-plan} with the ticket ref.
