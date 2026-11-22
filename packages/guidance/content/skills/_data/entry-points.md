# Entry points

The skill that opens the work in a ticket's worktree follows from the ticket's state, the branch's commits and pull request, and the artifacts in its ticket directory. This file states that rule once; {skill?:start-ticket} applies it when a session starts, and the split report of every plan skill names that skill rather than choosing an entry point of its own.

## Inputs

Each input names the command that reports it. A route matches only on what these commands report, or on a judgment that the route names as one.

- **The ticket's state**: open or closed, from the platform fetch in [ticket source resolution](ticket-source-resolution.md#platform-specific-fetch).
- **The branch's pull request**: `pr_url` from the session-context manifest, or else the pull request whose head is `branch_name` in any state (on GitHub, `gh pr list --head {branch_name} --state all --json url,state,isDraft,reviewDecision,statusCheckRollup,mergeable`). `pr_url` is usually null on a ticket branch, so the lookup is the common case. A branch without a pull request does not match route 1 or route 3.
- **The commit count**: the commits on the branch past its merge base with `default_branch`, from `git rev-list --count $(git merge-base HEAD {default_branch})..HEAD`. When `git merge-base` fails, such as on a remote-tracking ref that is absent, routes 4–6 do not match, and the announcement says that the commit check did not run.
- **The active run's state**: from `node {harness_home_dir}/scripts/resolve-review-run.mjs state --ticket-dir {ticket_dir}`, which prints `hasReview`, whether the [active run](artifact-conventions.md#run-directories) contains a review, and the run's newest review or change summary as `newestPath` and `newestKind` (`review` or `response`), with `findings`, the count of actionable findings in a newest review. A ticket directory without an active run reports `hasReview: false`. A change summary in a run without a review is the run's first summary, not a response.
- **The stored diff base**: `diff_base` from the session-context manifest, which the split made after implementation stores for each piece. It applies while `git rev-parse --verify {diff_base}` and `git merge-base --is-ancestor {diff_base} HEAD` both succeed.
- **The ticket directory**: The manifest's `ticket_dir`, and the artifact types that [artifact conventions](artifact-conventions.md) defines. The newest plan is the one that the plan resolution of {skill?:implement-plan} selects (its [process](../implement-plan/SKILL.md#process), step 2): the greatest filename prefix across `*_plan.md` and `*_plan-v*.md`, never `*_plan-review.md`. The newest artifact of any other type is the one with the greatest filename prefix.

## Routes

Check the routes in order and stop at the first match. Each route names the skill, the arguments that it passes, and the reason that the announcement states. No route merges, pushes, or opens a pull request.

1. **Done.** The ticket is closed, or the branch's pull request is merged: Stop, and report in one line `{ticket_ref} is {state}; PR {url} is {state}.`, with each clause only when it applies. A closed pull request that was not merged does not match, because the work may restart.

2. **Review awaiting a response.** `newestKind` is `review` and `findings` is above 0: {skill?:respond-to-review}, without arguments. Reason: the newest review has findings without a response. The announcement names the review's path.

3. **Open pull request.** The branch's pull request is open: Stop, and report its state and what remains: that it is a draft, that checks fail, that changes were requested, that the active run does not contain a review ({skill?:review-pr}), or that it is ready for {skill?:merge-pr}.

4. **Split piece.** `diff_base` is set, the commit count is above 0, and `hasReview` is false: {skill?:review-branch} with `--ticket={ticket_ref}`, adding `--diff-base={diff_base}` when the stored diff base applies. Reason: a split made after implementation left this piece for review. When the stored diff base does not apply and differs from `default_branch`, the announcement says that the review uses the default diff base, and which check failed.

5. **Implemented, not reviewed.** The commit count is above 0 and `hasReview` is false: Ask. The candidates are {skill?:implement-plan} with `--plan={path}` and `--ticket={ticket_ref}` when a plan exists, to finish the tasks, and {skill?:review-branch} with `--ticket={ticket_ref}`. Whether the plan's tasks are all done is a judgment: The plan is read-only and does not record progress.

6. **Reviewed.** The commit count is above 0, `hasReview` is true, and the newest artifact is a response or a review without actionable findings: Ask. The candidates are {skill?:review-branch} with `--ticket={ticket_ref}`, for another pass, and {skill?:create-pr}.

7. **Unsettled plan.** The newest plan contains a list entry inside its `## Decisions taken` section whose text starts with 🔲: {skill?:refine-plan} with the plan path and the ticket. Reason: the plan contains a decision that no checkpoint approved. A 🔲 elsewhere in the plan, or one that a decision mentions rather than starts with, does not match.

8. **Spike.** The ticket body, in its newest ticket artifact or on the platform, contains the `## Question` section and the `### Questions to answer` tier of the [spike ticket template](spike-conventions.md#spike-ticket-template), or the newest plan contains `## Investigation steps`:
   - The newest plan is a feature plan, one that contains `## Tasks`, whose filename prefix is greater than that of every artifact that this route names: {skill?:implement-plan} with `--plan={path}` and `--ticket={ticket_ref}`.
   - The ticket directory contains a `dispositions` artifact, which {skill?:triage-spike-findings} saves once its last write succeeds: Stop, and report the findings artifact and the dispositions. The spike is finished.
   - The ticket directory contains `triage/dispositions.json` without a `dispositions` artifact: {skill?:triage-spike-findings} with the findings path, which resumes the interrupted triage from that record.
   - A `spike-findings` artifact newer than the plan proposes work, judged by reading it with the test of {skill?:investigate-spike} step 8: {skill?:triage-spike-findings} with the findings path.
   - A `spike-findings` artifact newer than the plan does not propose any work: Stop, and report it, with the closing post as the step that remains, which {skill?:investigate-spike} offers.
   - The newest plan is a spike plan: {skill?:investigate-spike} with `--plan={path}` and `--ticket={ticket_ref}`.
   - Otherwise: routes 10c and 10d (Feature), with `as a spike` after the ticket ref. That phrase is the explicit entry into spike mode that [spike conventions](spike-conventions.md) requires.

9. **Prototype round.** The ticket directory contains a prototype set (`prototypes/manifest.json`, per [the set](../index-prototypes/SKILL.md#the-set)), or a `brief`, `comparison`, `idea-decisions`, or `refinement-log` artifact, or the ticket calls for two or more competing prototypes of one idea, judged by reading it:
   - The newest plan is a feature plan, one that contains `## Tasks`, whose filename prefix is greater than that of every artifact that this route names: {skill?:implement-plan} with `--plan={path}` and `--ticket={ticket_ref}`.
   - A `refinement-log` artifact: {skill?:design-and-plan} with the ticket ref, for the end vision and the ticket. {skill?:refine-prototype} saves the log when the refinement closes, so the log marks the refinement as done.
   - An `idea-decisions` artifact that is newer than the newest `comparison` and does not contain an `open` row: {skill?:refine-prototype}.
   - A `comparison` artifact, with an `idea-decisions` artifact newer than it that contains an `open` row, or none newer than it: {skill?:prepare-prototype-brief} with the ticket ref and the scope note `decide the ideas (step 7)`.
   - Otherwise: {skill?:prepare-prototype-brief} with the ticket ref, adding the scope note `resume the round from the saved brief` when a `brief` artifact exists.

10. **Feature.**
    - a. Route 7 (Unsettled plan) covers a plan that contains an unsettled decision.
    - b. Any other plan: {skill?:implement-plan} with `--plan={path}` and `--ticket={ticket_ref}`.
    - c. The ticket is ready: It states a problem, a proposed solution, and acceptance criteria, and applying [ticket evaluation](ticket-evaluation.md) does not find any divergence that needs a design conversation. This is a judgment, and the announcement states its reason. {skill?:plan} with the ticket ref.
    - d. Otherwise: {skill?:design-and-plan} with the ticket ref.

A spike or a prototype round does not commit to the branch, so a commit past the merge base marks implemented work, and routes 4–6 come before every route for a state before implementation.

## When to ask instead

A clear first match is invoked without asking. Routes 5 and 6 always ask, because the state that they match does not settle which skill comes next. In the cases below, {skill?:start-ticket} does not invoke a skill either: It announces what it found, names the candidate skills, and asks which one opens the work.

- **Conflicting evidence.** The first match is route 8 (Spike) or route 9 (Prototype round), and the ticket directory contains artifacts of both kinds: a spike artifact (`spike-findings`, `dispositions`, or `triage/dispositions.json`) and a prototype artifact (a prototype set, or a `brief`, `comparison`, `idea-decisions`, or `refinement-log` artifact).
- **An unclear judgment.** The match depends on a condition that a route judges by reading (whether the findings propose work in route 8, whether the ticket calls for competing prototypes in route 9, whether the ticket is ready in route 10c), and the reading supports both outcomes. A judgment that the reading settles is announced with its reason and invoked.
