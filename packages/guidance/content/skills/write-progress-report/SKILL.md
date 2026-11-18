---
name: write-progress-report
description: Write a customer-facing progress report from a set of work items, with one section per workstream, each with its health and a table of what needs the customer's input, what is done, what is in progress, and what is planned
user-invocable: true
---

# Write progress report

Write a progress report for a reader outside the team. A source supplies the work items in one normalized shape, a bundled helper assigns each item its status and orders the rows of each workstream, you write every word that the customer reads, and the helper checks the links and renders the report.

The work does not have to be software, and the items do not have to come from a tracker: A file of items in the normalized shape is a source of its own.

**Announce at start:** "Using write-progress-report to write a progress report from {source}."

## Arguments

| Argument                    | Description                                                                                          | Default                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| `--items <path>`            | A JSON file of items in the [item contract](#item-contract). It replaces the source.                 | None                              |
| `--source <name>`           | The tracker that supplies the items. `github` is the one with a delegate.                            | The project's ticket platform     |
| `--scope <query>`           | Which items to read, in the source's own query language, passed to the delegate as written.          | Every item that the source holds  |
| `--period <start>[..<end>]` | The completion dates, inclusive, of the done items to report. Other items are always reported.       | Every done item; the end is today |
| `--format <name>`           | The format in which to render the report: `markdown`, or `confluence` for Confluence storage format. | `markdown`                        |

## Item contract

The file is `{ "workstreams": [ ... ], "items": [ ... ] }`, and `workstreams` is optional. The helper rejects a field that the contract does not define.

Each item states facts, never a status:

| Field         | Type             | Meaning                                                                     |
| ------------- | ---------------- | --------------------------------------------------------------------------- |
| `id`          | string           | The item's identifier in its source; never rendered                         |
| `title`       | string           | The item's title in its source                                              |
| `description` | string or `null` | Context for the details; never rendered                                     |
| `sources`     | string array     | Where the item is recorded, usually internal; never rendered                |
| `workstream`  | string or `null` | The `id` of the item's workstream                                           |
| `closed`      | boolean          | Whether the item is closed                                                  |
| `completed`   | boolean          | Whether a closed item was closed as completed                               |
| `started`     | boolean          | Whether work on an open item has started                                    |
| `needsInput`  | boolean          | Whether an open item is an ask of the customer                              |
| `completedOn` | date or `null`   | UTC `YYYY-MM-DD` on which the item was completed; required for one that was |
| `targetOn`    | date or `null`   | UTC `YYYY-MM-DD` by which the item is expected to be completed              |
| `neededBy`    | date or `null`   | UTC `YYYY-MM-DD` by which the customer's input is needed                    |

A workstream is `{ "id", "title", "health"?, "note"? }`, in which `health` is `on-track`, `at-risk`, or `off-track`. An item may name a workstream that the file does not declare.

## Process

Every helper command prints one JSON result. When a result has `ok: false`, stop and report its `message` as written, except where a step says otherwise.

### 1. Obtain the items

- With `--items`, use that path, and skip to step 2.
- Otherwise, take the source from `--source`, or else from the [platform resolution cascade](../_data/ticket-source-resolution.md#platform-resolution-cascade).
  - For `github`, create the output path with `mktemp "${TMPDIR:-/tmp}/progress-items.XXXXXX"` and invoke {skill?:list-gh-progress-items} with that path, `--scope`, and the needs-input label when the bound guidance names one. It returns the path of the items file.
  - For any other source, stop, and report that no delegate reads it and that `--items` accepts a file of items in the [item contract](#item-contract).

### 2. Assemble the sections

Create a path with `mktemp "${TMPDIR:-/tmp}/progress-assembled.XXXXXX"`, then write the result to it:

```bash
node {harness_home_dir}/skills/write-progress-report/write-progress-report.mjs assemble --items {items path} [--period {period}] > {assembled path}
```

Read the result from that file. It contains `sections` in report order, each with its `workstream` (or `null` for the items without one) and its `rows`. Each row contains the item's fields, its `status`, its `label`, its `date` cell, the `dateOn` that the cell shows or `null`, and whether it is `overdue`. The result also contains `lastUpdated`, the `period` or `null`, and the `omitted` items with their reasons.

### 3. Write the text

<!-- guidance-hook: progress-report-preferences -->

Rules that bound guidance states for the customer, such as tone, which items to omit, which hosts are internal, and each workstream's health, take precedence over the defaults below.

Write every word that the customer reads into a file created with `mktemp "${TMPDIR:-/tmp}/progress-text.XXXXXX"`, in this shape, with one section per assembled section and one row per assembled row:

```json
{
  "sections": [
    {
      "workstream": "ws-invoicing",
      "heading": "Invoicing",
      "health": "at-risk",
      "note": "The export waits on access to your test account.",
      "rows": [{ "id": "#12", "workItem": "Spreadsheet export", "details": "Verified on our test site; we deploy it to yours next." }]
    }
  ]
}
```

1. **Heading:** Name each workstream as the customer knows it. The workstream's `title` comes from the source and may use internal wording.
2. **Health:** Leave `health` out when the workstream declares one. Otherwise, propose it from the rows: `at-risk` when a row is `overdue`, `off-track` when the rows show that the workstream cannot meet its plan, and `on-track` otherwise. State the reason in `note` when the health is not `on-track`.
3. **Work item:** A short title in the customer's terms. Never copy the source's title.
4. **Details:** Markdown of one or more paragraphs or a list, using only links, emphasis, and inline code within them, which every format renders. Read the `title` and the `description` for what the item achieves, and state what the customer can now do, will be able to do, or must do, with the caveats and dependencies that the customer needs, such as "verified on our test site, deploying to yours next". For a needs-input row, state the ask and what it unblocks.
5. **Links:** Attach each link to words of the text as a Markdown inline link, and link only to a place that the customer can open, such as a deliverable, its documentation, or a demo. Never link to an item's `sources`, and never name an `id` or an internal name unless the bound guidance asks for them.

## Output

Render the report, passing each host that the bound guidance lists as internal:

```bash
node {harness_home_dir}/skills/write-progress-report/write-progress-report.mjs render --assembled {assembled path} --text {text path} [--format {format}] [--internal-host {host}]...
```

When the result has `error: invalid-text`, its `message` names each problem by its place in the text file, such as `sections.0.rows.2.details`: Correct the text and render again. Stop on any other failure.

Print the result's `text` as one fenced block, ready to paste. Under `confluence`, the text is the body of a page in Confluence storage format, in which health and statuses are status lozenges and dates are date elements. Below the block, state in one line each:

- Each health that you proposed, with its reason.
- That the delegate reported `truncated`, when it did.
- How many items the helper omitted for each reason, leaving out a count of zero.
