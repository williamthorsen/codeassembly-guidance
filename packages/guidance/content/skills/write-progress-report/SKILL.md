---
name: write-progress-report
description: Write a customer-facing progress report from a set of work items, as one Markdown table of the done, in-progress, and planned items, each stated as an outcome that the customer recognizes
user-invocable: true
---

# Write progress report

Write a progress report for a reader outside the team. A source supplies the work items in one normalized shape, a bundled helper assigns each item its status and orders the rows, and you reword each item as an outcome and render the report.

The work does not have to be software, and the items do not have to come from a tracker: A file of items in the normalized shape is a source of its own.

**Announce at start:** "Using write-progress-report to write a progress report from {source}."

## Arguments

| Argument                    | Description                                                                                                      | Default                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `--items <path>`            | A JSON file of items in the [item contract](#item-contract). It replaces the source.                             | None                                       |
| `--source <name>`           | The tracker that supplies the items. `github` is the one with a delegate.                                        | The project's ticket platform              |
| `--scope <query>`           | Which items to read, in the source's own query language, passed to the delegate as written.                      | Every item that the source holds           |
| `--period <start>[..<end>]` | The completion dates, inclusive, of the done items to report. In-progress and planned items are always reported. | Every done item; the end defaults to today |

## Item contract

Each item states facts, never a status:

| Field         | Type             | Meaning                                                    |
| ------------- | ---------------- | ---------------------------------------------------------- |
| `id`          | string           | The item's identifier in its source                        |
| `title`       | string           | The item's title in its source                             |
| `description` | string or `null` | Context for the rewording                                  |
| `url`         | string or `null` | Where the item lives                                       |
| `closed`      | boolean          | Whether the item is closed                                 |
| `completed`   | boolean          | Whether a closed item was closed as completed              |
| `started`     | boolean          | Whether work on an open item has started                   |
| `completedOn` | date or `null`   | `YYYY-MM-DD` on which the item was completed               |
| `expectedOn`  | date or `null`   | `YYYY-MM-DD` by which the item is expected to be completed |

The file is `{ "items": [ ... ] }`. The helper rejects a field that the contract does not define.

## Process

Every helper command prints one JSON result. When a result has `ok: false`, stop and report its `message` as written.

### 1. Obtain the items

- With `--items`, use that path, and skip to step 2.
- Otherwise, take the source from `--source`, or else from the [platform resolution cascade](../_data/ticket-source-resolution.md#platform-resolution-cascade).
  - For `github`, create the output path with `mktemp "${TMPDIR:-/tmp}/progress-items.XXXXXX"` and invoke {skill?:list-gh-progress-items} with that path and `--scope`. It returns the path of the items file.
  - For any other source, stop, and report that no delegate reads it and that `--items` accepts a file of items in the [item contract](#item-contract).

### 2. Assemble the rows

```bash
node {harness_home_dir}/skills/write-progress-report/write-progress-report.mjs assemble --items {path} [--period {period}]
```

The result contains `rows` in report order, each with its `status`, `glyph`, `label`, and `date` cell text, the `counts` per status, the `period` or `null`, and the `omitted` items with their reasons.

### 3. Reword and render

<!-- guidance-hook: progress-report-preferences -->

Rules that bound guidance states for the customer, such as tone, columns, or items to omit, take precedence over the defaults below.

1. Reword each row as an outcome that the customer recognizes: what the customer can now do, or will be able to do, stated in the customer's terms. Read the `title` and the `description` for what the item achieves; never copy the title, and leave out the `id`, the URL, and every internal name unless the bound guidance asks for them.
2. Open the report with one summary line: `{start} to {end}: {done} done, {inProgress} in progress, {planned} planned.`, or `To {today}: …` when `period` is `null`.
3. Render one table with the rows in the helper's order:

   ```markdown
   | Status         | Outcome                                       | Date                |
   | -------------- | --------------------------------------------- | ------------------- |
   | ✅ Done        | Invoices can be exported as a spreadsheet     | 2026-03-04          |
   | 🔄 In progress | Reports can be scheduled to arrive by email   | Expected 2026-03-20 |
   | 🗓️ Planned     | Teams can share saved filters                 |                     |
   ```

   The status cell is the row's `glyph` and `label`, and the date cell is its `date`.

## Output

Print the summary line and the table as one fenced Markdown block, ready to paste. Below the block, state in one line each when the delegate reported `truncated`, and how many items the helper omitted for each reason; leave out a count of zero.
