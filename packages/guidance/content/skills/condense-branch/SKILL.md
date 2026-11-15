---
name: condense-branch
description: Squash branch commits into a single well-described commit
user-invocable: true
---

# Condense branch

Condense the current branch into a single commit with a comprehensive message.

## Result

The branch holds one commit on its merge base with the default branch. That commit's tree is the tree of the branch's original head, and its message describes the branch as a whole.

- A backup branch points at the original head.
- Uncommitted changes, staged or not, and untracked files are not part of the condensed commit, and they are not discarded. Leave them where they are: Do not stash, stage, or commit them.

## Process

1. **Analyze branch** to create a good commit message, and consolidate it while its commits still exist:
   - Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `default_branch` from the manifest JSON that it emits on stdout.
   - Consolidate the range into a scratch file, created per the path rules of [gh body file](#gh-body-file) and named `consolidation-{timestamp}.json`:

     ```bash
     consolidation_path="{absolute path from the scratch-directory step}"
     node {harness_home_dir}/scripts/describe-change.mjs consolidate-branch --base {default_branch} > "$consolidation_path" && cat "$consolidation_path"
     ```

     If the call fails, as it does when `commit.title_format` is empty, it leaves the file empty. Relay its error and continue without a consolidated record: The subject renders without a scope or type, and the message does not contain a trailer.

   - Report each `unmatched` subject and each `violations` entry to the developer. An unmatched subject does not get a trailer in step 2, so it drops out of the entries that the condensed commit declares.

   [The change record](../_data/change-record.md) states the consolidated record and the `Change:` trailer.

2. **Condense commits**:

   Write the title, a blank line, and the body to a scratch file per [gh body file](#gh-body-file), naming it `commit-message-{timestamp}.md`; do not inline the message into the shell command. Do not write any `Change:` trailer: The helper appends one per consolidation entry, oldest first, as the last paragraph.

   Run the bundled helper as one command:

   ```bash
   node {harness_home_dir}/skills/condense-branch/condense-branch.mjs --base {default_branch} --message-file {absolute message path} --consolidation-file {absolute path of the step-1 consolidation file}
   ```

   Pass `--consolidation-file` even when step 1 failed and left the file empty; the helper reads an empty or absent file as no trailers. Pass each path as the literal absolute path, unquoted, without a shell variable or a guard: The helper refuses a missing or empty message file itself.

   The helper creates the backup branch `{branch}-v{N}` at the first free version, writes the condensed commit without running hooks or signing it, and moves the branch to it. It does not touch the index or the working tree. It prints JSON naming the `backup` branch and the number of `trailers`; report both. On a non-zero exit it has not changed any ref: Relay its stderr and stop.

## Commit message creation

### If commits have detailed descriptions

Synthesize existing descriptions to describe the final result. Lead the first paragraph with what the branch accomplishes as a whole; use subsequent paragraphs for implementation details. Omit information that's no longer relevant (e.g., changes made then reversed).

### If commits lack detail

Use `{skill:summarize-change}` to compose a good commit message. Save the description per standard artifact conventions.

## Commit format

Compose the message per `{rulebook:commit-conventions}`. Use `describe-change.mjs` to render the full commit title (see [title-templates.md](../_data/title-templates.md) for syntax), taking `{scope}` and `{type}` from the step-1 `consolidated_record` and appending `!` to the type if it is breaking. If the consolidation failed, or a field is `null`, omit that flag:

<!-- include: ../_partials/commit-title-rendering.md / -->

<!-- include: ../_partials/gh-body-file.md / -->
