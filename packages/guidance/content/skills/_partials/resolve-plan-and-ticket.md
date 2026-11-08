1. **Get context**: Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `branch_name`, `default_branch`, `ticket_id`, `ticket_ref`, `ticket_url`, `scm`, `project_slug`, and `artifact_base_dir` from it.

2. **Resolve the plan**: Stop at the first source that yields one:
   - **Explicit `--plan=<path>`**: Read it.
   - **Already in context**: This session produced or read the plan. Use it as-is; do not re-read the file.
   - **Newest plan for the ticket**: The newest of `*_plan.md` and `*_plan-v*.md` under `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/` (run subdirectories included), by the greatest `YYYYMMDD-HHMMSSZ` filename prefix. Both forms have that prefix, so they sort chronologically together and the lexicographically greatest is the newest across the two. Because `refine-plan` writes its revision as `_plan-v2.md` under a later prefix than the plan that it revises, matching both forms lets a refined plan take precedence over the original that it supersedes. Do not widen to `*_plan*.md`, which also matches the `_plan-review.md` artifact written beside the revision.
   - **Ask**: The sources above do not resolve a plan. Ask the user for a path rather than working from the ticket alone: A caller who invoked this skill has a plan in mind.

   Announce the resolved path and its timestamp before executing anything. Several plans can exist for one ticket, and the newest is not always the intended one: This announcement is how the user catches a superseded plan while the choice can still change without cost. It is not ceremony, and it is not skippable when the resolution was unambiguous.

3. **Resolve the ticket**: Stop at the first source that yields one:
   - **Explicit `--ticket=<source>`**: Resolve per [ticket source resolution](../_data/ticket-source-resolution.md).
   - **Already in context**: This session already resolved the ticket. Use it as-is.
   - **Stored URL**: `ticket_url` from step 1, fetched per [Stored ticket URL](../_data/ticket-source-resolution.md#stored-ticket-url).
   - **Plan provenance**: The plan's frontmatter `ticket_ref` / `ticket_id`, resolved per [auto-resolve](../_data/ticket-source-resolution.md#auto-resolve).
   - **No ticket**: Every source failed; the plan was produced from a free-form description, or the ticket is unreachable. Announce that a ticket does not govern the run and execute against the plan as the sole contract. Do not stall on a missing ticket; do not silently substitute the plan for one without saying so.

4. **Read the plan and the ticket** in full before starting the work, including the plan's section on risks: It names the parts of the work that the author expected to need adaptation.

   Then, when a ticket governs the run, read its open blockers per [Open blockers](../_data/ticket-source-resolution.md#open-blockers). When it has one, report it and ask the user to confirm that the work should start despite it, as a `👍🏼👎🏼` confirmation. Do not start the work without a clear affirmation.

   Then check the branch per [branch currency](../_data/branch-currency.md), passing the paths that the plan names, such as the paths in a feature plan's **Files:** lists. Do not start the work while a question about the gap is unanswered.
