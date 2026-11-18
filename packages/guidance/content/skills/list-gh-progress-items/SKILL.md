---
name: list-gh-progress-items
description: List a GitHub repository's issues as progress-report items, using the delegate interface from write-progress-report
user-invocable: false
---

# List GitHub progress items

Internal delegate that supplies the work items of a progress report from a GitHub repository's issues. Called by `write-progress-report`; this skill does not assign statuses or render anything.

## Delegate interface

| Input   | Type             | Description                                                                                  |
| ------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `out`   | string           | The path to which the items file is written                                                  |
| `scope` | string or absent | A GitHub issue search query, such as `label:customer milestone:v2`; absent reads every issue |
| `repo`  | string or absent | The repository as `OWNER/NAME`; absent means the repository of the working directory         |
| `limit` | number or absent | The most issues to read; 500 when absent                                                     |

The delegate reports the items file's path, the item count, and whether the limit cut the list.

## Mapping

An issue closed as completed is completed on the UTC date of its `closedAt`. An issue closed for any other reason is closed and not completed, which the report omits. An open issue has started when it has an assignee or a linked pull request. A milestone's due date is the expected completion date of each of its issues.

## Process

1. Run `gh auth status`. If it fails, stop and report that `gh` is not authenticated.
2. Run the helper:

   ```bash
   node {harness_home_dir}/skills/list-gh-progress-items/list-gh-progress-items.mjs list --out {out} [--scope {scope}] [--repo {repo}] [--limit {limit}]
   ```

3. When the result has `ok: false`, stop and report its `message` as written. Otherwise, return its `path`, `count`, and `truncated` to the caller.
