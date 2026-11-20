---
name: triage-spike-findings
description: Dispose of the findings that a spike, a usability assessment, a code-health assessment, or a performance analysis left without a ticket. Inventories every undisposed item, grades each one's confidence and value, has a subagent without session context challenge every grade, and then creates the graded tickets, under an umbrella on GitHub, and records every disposition on the triage ticket. Use when a findings artifact has proposals or ideas that the existing tickets have not absorbed.
user-invocable: true
---

# Triage spike findings

Dispose of every item that a findings artifact leaves undisposed: the proposals, groupings, findings, and ideas that the filed tickets and comments did not absorb. You inventory them, recommend a disposition and two grades for each, have a {subagent:disposition-challenger} argue against every recommendation, and then, once the developer approves, create the tickets and post the record. A bundled helper checks a GitHub repository's labels, validates the dispositions record, and renders the comments.

**Announce at start:** "Using triage-spike-findings to dispose of the findings of {source} on {ticket_ref}."

## Inputs

- **The findings artifact**: A `spike-findings` artifact, a `usability-findings` artifact, a `code-health-findings` artifact, or a `performance-findings` artifact, by local path or by artifact URL. Read a URL with the Artifact tool and save the content to `{ticket_dir}/triage/findings.md`, so that the challenger can read it from a path; on a harness without that tool, the input is a local path.
- **The triage ticket**: The ticket on which the dispositions are posted and under which the working files are kept, resolved per [ticket source resolution](../_data/ticket-source-resolution.md); when none is given, the session's ticket. On GitHub, the umbrella is created as a separate ticket, so the triage ticket may be the spike's own ticket.
- **The batch**, optional: the item ids, each with its title, that a follow-up triage ticket names. When it is given, the inventory covers those items alone.

A run triages one [findings batch](../_data/spike-conventions.md#findings-batches) on one triage ticket.

The run supports each [triage platform](../_data/spike-conventions.md#triage-platforms), GitHub through `gh`. Step 1 resolves the platform, and every later step reads it from the record's `platform`. Each step states the GitHub path; a sentence that opens with "On Jira" states that step's Jira counterpart.

## Grades and dispositions

Each item takes a disposition and two grades:

- **Disposition**: `ticket` (a new ticket, on GitHub a child of the umbrella), `comment` (a note on an existing issue, which must be open and must own the file or the behavior), `merge` (folded into another item's ticket; the target is a `ticket` item), or `drop`.

<!-- include: ../../_partials/finding-grades.md / -->

The helper refuses a record that gives a `low` item a ticket. Value never decides whether an item gets a ticket; it is recorded on every item and labels every child on GitHub.

The labels come from the common preset of `release-kit sync-labels`: the `value:` family, and the `confidence:` family that williamthorsen/node-monorepo-tools#1017 added. A repository whose labels lack either family cannot take the children, because `gh issue create` fails on a label that the repository does not have. On Jira, the run does not read or set any label: Jira does not have the two families, and on some sites labels are one namespace shared by every project. Each child's grade line, which step 6 composes, records its grades in their place.

## Process

Every helper command prints one JSON result. When a result has `ok: false`, stop and report its `error` and `message`, except when a step below says otherwise. Invoke the helper as:

```bash
node {harness_home_dir}/skills/triage-spike-findings/triage-spike-findings.mjs {command} {flags}
```

Resolve `{ticket_dir}` per {skill:save-artifact}, and write every working file under `{ticket_dir}/triage/`.

### 1. Preflight

1. Resolve the platform as {skill:create-ticket} step 3 resolves it: from the integrations that `.agents/preferences.yaml` enables, then from the git remote. The session-context manifest's `scm` names the code host, which does not decide where the tickets live. On a platform that is not a [triage platform](../_data/spike-conventions.md#triage-platforms), stop and report that the skill does not support it.
2. On GitHub, run `gh auth status` and `gh repo view --json nameWithOwner`. If either fails, stop and report why. Then run the helper's `check-labels`. When `complete` is false, stop: Name each missing label, and state that the common preset of `release-kit sync-labels` supplies both families (the `confidence:` family from williamthorsen/node-monorepo-tools#1017), so the repository takes them by upgrading release-kit and regenerating its label file rather than by creating them by hand.
3. On Jira, identify the client per {skill?:update-jira-ticket}. When it is `acli`, run that skill's site check against the triage ticket's URL, or against `ticket.base_url` when the URL is not known. Read the triage ticket through the client, and stop when no client can read it.
4. Create `{ticket_dir}/triage/`, and save the findings there when they came from a URL.

### 2. Inventory

Read the findings in full. List every item that the artifact leaves without a disposition, where a disposition is a ticket or a comment that the artifact itself names: a proposed ticket that was not filed, a grouping, a finding outside every grouping, and an idea that the filed tickets did not absorb. Verify each item's claim against the current code and against the open issues, found with `gh issue list --search` and read with their comments per [platform-specific fetch](../_data/ticket-source-resolution.md#platform-specific-fetch). On Jira, search the triage ticket's project with `acli jira workitem search --jql 'project = {project key} AND statusCategory != Done AND text ~ "{terms}"' --json --paginate`, or with the search of the connected client, and read each match with its comments per the same section's Jira fetch. The finding may describe a problem that a merge has since fixed, a decision that the repository records, or work that an open issue already covers.

Write `inventory.md` as a table: the item's id (the artifact's own id when it has one), its title, where it appears in the artifact, the verification outcome (holds, partly holds, or does not hold, with the evidence), and, when the findings give the item an evidence key and the paths that it covers, that key and those paths, copied verbatim. Give an item that the artifact does not identify an id of the inventory's own, so that a follow-up triage ticket can name it.

When the inventory holds more items than the batch ceiling, split it into batches of at most the ceiling, in the artifact's ranking order, or in the order in which the items appear when the artifact does not rank them, and keep each grouping in one batch. Triage the first batch, and drop the other items from the table. Add a **Batches** table to `inventory.md` with the batch number, its items' ids and titles, and its follow-up ticket, blank until step 7 creates it.

### 3. Recommend

Write `recommendations.md`: one line per item, with its id, title, disposition, confidence, value, and a one-sentence reason. Nothing else goes in the file, because the challenger reads it and a sentence of your reasoning there would bias its judgment toward yours. A `merge` names a `ticket` item as its target; a `comment` names its issue number, or its key on Jira.

### 4. Challenge

Send one {tool:Task} call, `subagent_type: disposition-challenger`, with this block and nothing else composed into it. `findings` is the copy saved in step 1, or the local path that was given:

```dispatch
findings: {ticket_dir}/triage/findings.md
platform: {the platform from step 1}
recommendations: {ticket_dir}/triage/recommendations.md
root: {repository root}
```

**A reply that lacks the `Phase: disposition-challenge` line is a challenger stopped by its turn limit.** Resume it once, asking only for its report; on Claude Code, send it a message with `SendMessage`, addressed by the agent ID that its dispatch returned. When the resumed challenger still does not return a report, do not dispatch again: Record the challenge as not returned, treat every item as unchallenged, and say so in the record's `challengeSummary`.

Save the reply as `challenge.md`. Then take each item in turn: Defend the recommendation when the argument fails on the evidence, modify it when the argument stands in part, and abandon it when the argument stands. A defense answers the argument on the evidence that the argument names; a defense that rests on other grounds fails. An argument that lowers the grade of a code-health item on the one-time cost of the change fails under the grade definitions above, even when the challenger raises it.

Decide the blockers of every `ticket` item under the threshold in the ticketing preferences rulebook: An item is blocked by another ticket when there is some probability that the other ticket affects it and should be merged first, and a ticket whose design takes another ticket's outcome as an input is blocked by it. A blocker is another `ticket` item, by id, or an open issue in this repository outside the triage, by number; check each issue with `gh issue view {issue} --json state`, and omit a closed one, which does not block. On Jira, a blocker outside the triage is a work item, by key; read its status with `acli jira workitem view {key} --json --fields status`, and omit one whose status category is `done`. Record every such dependency in `blockedBy`, never in `notes`.

Write `dispositions.json` in the helper's record shape: `platform` (`github` or `jira`, from step 1), `source` (the findings as given), `triageTicket` (its number, or its key on Jira), `umbrella: null`, `items`, `challengeSummary` (what the challenge refuted or narrowed and what it did not), and `notes` (the lines of the comment's "Labels and follow-ups" section, "Follow-ups" on Jira, empty when there are none). Each item has `id`, `title`, `disposition`, `confidence`, `value`, `reason`, `target` (the issue of a `comment`, the target id of a `merge`, null otherwise), `ticket: null`, `blockedBy` on a `ticket` item that has blockers (item ids, and issue numbers or keys), `evidence` with `key` and `paths` on an item whose inventory row has them (omitted otherwise), and `challenge` with `argument`, `outcome` (`defended`, `modified`, or `abandoned`), and `note`. When any item has `evidence`, write the output of `git rev-parse HEAD` into the record's `commit`. Run the helper's `validate`, which reports every schema and gate violation at once, a cycle among the blockers included, and fix the record until it passes.

### 5. Checkpoint: The dispositions

Present the dispositions as a table (item, disposition, confidence, value, blocked by, reason, challenge outcome), in the order that `validate` reports as `order`, which places every blocker before the items that it blocks, and the challenge summary, and ask in the action-items block for approval. Revise the record until the developer approves it; re-run `validate` after each change. Once the developer approves, and when any item has `evidence`, set the record's `commit` again to the output of `git rev-parse HEAD`, so that it names the commit at which the dispositions were approved and a later run can tell whether an item's paths changed after the disposition, and run `validate` once more.

<!-- include: ../_partials/action-items.md / -->

### 6. Compose and confirm

Compose the bodies:

- **The umbrella**, on GitHub, when at least one item is a `ticket`: its problem (the follow-up work of the findings), its context (a link to the triage ticket, and the tickets that the findings filed without adopting them, listed and not made children), and "Every child is closed" as its acceptance criterion. It does not take a graded label. On Jira, the run does not create an umbrella, because Jira's standard hierarchy accepts only an epic as a task's parent.
- **One child per `ticket` item**, in the ticket skeleton that {skill:create-ticket} step 2 states: problem, context, and acceptance criteria, with the title and reason of every `merge` item that targets it folded in. Its labels are `confidence:{grade}` and `value:{grade}`. On Jira, it does not take any label. It takes the triage ticket's parent, read with `acli jira workitem view {triage ticket} --json --fields parent`, and no parent when the triage ticket has none. Its `## Context` links the triage ticket, and that section's last line is its grade line: `Triage grades: confidence {confidence}, value {value}`.
- **One follow-up triage ticket per later batch**, when the **Batches** table has more than one row: titled `Triage batch {n} of {findings title}`, with a link to the findings artifact, its path written `~/`-relative as in the [closing post](../_data/spike-conventions.md#closing-post), a link to the triage ticket, whose dispositions comment records the earlier round, the batch's items by id and title as its **The batch** input, and `triage-spike-findings` as its next step. Read the triage ticket's parent with `gh issue view {triage ticket} --json parent`, or on Jira with the `acli` call above: A follow-up takes that parent when there is one, so that it sits beside its siblings, and no parent otherwise. Each follow-up is blocked by the one before it. The first is not blocked: This round's dispositions are posted before the next round starts. Add one line per follow-up to the record's `notes`, `Batch {n} ({item ids}) is triaged in {follow-up}`, with the follow-up's title in place of `{follow-up}` until step 7 creates it, so that the dispositions comment names every follow-up.

Run the helper's `render --preview` to `{ticket_dir}/triage/preview/`, which writes the dispositions comment with `(pending)` where a number is not yet known, and one comment file per issue that a `comment` disposition names.

Show everything that step 7 will create or post in one block: every body with its title and labels, the parent relationship and the blockers of each child and each follow-up, every per-issue comment with its issue, the dispositions comment, and, on a run given **The batch**, the close of the triage ticket as completed. Confirm once in the action-items block. This confirmation is the only one: {skill:create-ticket} does not re-confirm a relationship given as an argument.

### 7. Write

Nothing before this step writes anything remote. On a failed write, stop and report which item failed; every number already recorded stays in `dispositions.json`, so that a re-run of this step creates only what is still null and checks each issue before posting on it.

1. On GitHub, when at least one item is a `ticket` and `umbrella` is null, create the umbrella with {skill:create-ticket}, and write its number into `umbrella`.
2. For each `ticket` item, in the order that `validate` reports as `order` for the approved record, run {skill:create-ticket} with `--parent {umbrella}` and `--label confidence:{grade},value:{grade}`, adding `--blocked-by` with the item's blockers as `#{number}` (the recorded `ticket` of each item id, and each issue number) when it has any, and write the returned number into the item's `ticket` as soon as it is returned. On Jira, pass `--parent` with the triage ticket's parent when it has one, and `--blocked-by` with the blockers' keys, never `--label`, and write the returned key into `ticket`. Because `order` places every blocker first, each item id that `--blocked-by` names already has its ticket.
3. For each `ticket` item, read `gh issue view {ticket} --json parent,blockedBy`, and add what is missing in one `gh issue edit {ticket} --parent {umbrella} --add-blocked-by {numbers}` call, omitting a flag that has nothing to add. {skill:create-ticket} sets the parent and the blockers in one call, so a rejected blocker can drop the parent as well, and this read-back is how a failed link is found. On a re-run, it completes the links of the items that an earlier run created. On Jira, read `acli jira workitem view {ticket} --json --fields parent,issuelinks`, read the blockers as [open blockers](../_data/ticket-source-resolution.md#open-blockers) reads them on Jira, and add each missing one with `acli jira workitem link create --out {ticket} --in {blocker} --type Blocks --yes`. `acli` cannot set a parent after creation: When {skill:create-ticket} reported `parentSkipped` or the read-back does not show the composed parent, add the line `{ticket} does not have its parent {parent}` to `notes`, so that the dispositions comment records it.
4. For each later batch, in batch order, skip the batch when its follow-up ticket is already recorded in the **Batches** table. Otherwise create its follow-up with {skill:create-ticket}, adding `--parent` and `--blocked-by` as step 6 composed them, and as soon as the number is returned, write it into the table and replace the follow-up's title with `#{number}`, or with its key on Jira, in its `notes` line.
5. Run the helper's `render` to `{ticket_dir}/triage/rendered/`, without `--preview`.
6. Post each `comment-{issue}.md` on its issue, and then `dispositions-comment.md` on the triage ticket. Before each post, read the issue's comments with `gh issue view {issue} --json comments`, and skip the post when a comment already opens with the first line of the rendered file:

   ```bash
   body_path="{ticket_dir}/triage/rendered/comment-{issue}.md"
   [ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
   gh issue comment {issue} --body-file "$body_path"
   ```

   Keep the URL that `gh issue comment` prints for the dispositions comment; when the post was skipped, keep the `url` of the matching comment instead. Step 8 links it.

   On Jira, post through the client that {skill?:update-jira-ticket} names. With `acli`, convert each rendered file to ADF with that skill's `convert-body` call, read `acli jira workitem comment list --key {key} --json --paginate`, which prints one JSON object per page and each comment's `body` as plain text, and skip the post when a body, with its whitespace collapsed, opens with the rendered file's first line without its Markdown markers, such as the `## ` of the dispositions heading. Otherwise, post with `acli jira workitem comment create --key {key} --body-file {ADF path}`. For the dispositions comment, keep `{site}/browse/{triage ticket}?focusedCommentId={id}`, taking the comment's `id` from the comment list, read again after a post.

7. On a run given **The batch**, close the triage ticket without a closing post, because its dispositions comment is its record: Read `gh issue view {triage ticket} --json state`, and run `gh issue close {triage ticket} --reason completed` only while the state is `OPEN`. On Jira, run `node {harness_home_dir}/scripts/manage-jira-ticket.mjs close --key {triage ticket}` without `--post`; it transitions the ticket only while its status category is not `done`.
8. Save `dispositions-comment.md`, with frontmatter, as the ticket-level `dispositions` artifact per {skill:save-artifact}.

### 8. Report

Report the umbrella when one was created, each child with its grades and blockers in the order in which step 7 created them, each Jira child whose parent was not set, each follow-up triage ticket with its batch, each issue commented on, the close of the triage ticket on a run given **The batch**, and the artifact's path.

When the record names two or more tickets among the children and the follow-up triage tickets, print the list for them after the report, per [implementation-order list](#implementation-order-list), leaving out the umbrella. They include a ticket that an earlier run of the same record created.

The triage round ends the spike, so offer to close the triage ticket with the [closing post](../_data/spike-conventions.md#closing-post) in the same response's action-items block, showing the post's body, and on consent post it and close the ticket with that section's checks. When the developer declines the offer, the triage ticket stays open. Do not offer it when the run was given **The batch**: A follow-up triage ticket's dispositions comment is its record, and step 7 has closed the ticket. The post contains:

- The answer to each question to answer and the recommendation on each decision to enable that the triage ticket's body lists, taken from the findings and the approved dispositions. A body that lists neither leaves the post with the items below alone.
- The count of items by disposition.
- Links to the umbrella, to each follow-up triage ticket, to the dispositions comment, and to the findings artifact, its path written `~/`-relative.

It does not repeat the dispositions, which the dispositions comment records.

<!-- include: ../_partials/gh-body-file.md / -->

<!-- include: ../_partials/implementation-order-list.md / -->
