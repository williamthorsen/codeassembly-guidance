## Implementation-order list

Print open tickets that have work of their own in the order in which to implement them, as a tree for a narrow column. An umbrella, a ticket that has sub-issues, is left out, because its children do its work; the step names the children for them to be listed. The step that links here names the tickets, in the order in which it reached them, an `--external` entry for each ticket outside GitHub, and an `--edge` for each dependency that the tracker does not record. A bundled helper reads the tickets, orders them, and writes the fixed part of every line. You shorten the titles and mark the publish gates.

1. **Run the helper.**

   ```bash
   node {harness_home_dir}/skills/implementation-order/implementation-order.mjs \
     --ticket {OWNER/REPO#N} --external "{REPOSITORY}:{KEY}={Title}" --edge "{BLOCKER}>{BLOCKED}"
   ```

   Write a GitHub ticket as `OWNER/REPO#N`, taking the repository from the ticket's URL. For a ticket outside GitHub, `{REPOSITORY}` is the repository in which the ticket is implemented, as `OWNER/NAME` when the owner is known and `NAME` otherwise; it gives the ticket that repository's prefix. Omit `{REPOSITORY}:` only when the repository is not known. Repeat each flag once per ticket or edge. Each side of an edge is `OWNER/REPO#N` or the key, without its repository, that an `--external` declares, and the blocked side is a listed ticket. On a non-zero exit, report the helper's stderr and do not print the list: A list that lacks a ticket misstates the order.

   The helper prints `{"tickets": [...], "omitted": [...], "cycle": [...]}`. `tickets` is in list order. `omitted` names each ticket that the list leaves out, with its `reason`: `closed`, or `umbrella` for an open ticket that has sub-issues.

2. **Shorten each title** to at most the ticket's `titleBudget` characters. Cut words rather than end with an ellipsis, and keep the leading verb. Leave a title that already fits as it is.

3. **Find the publish gates.** A gate follows a ticket when its change must be published before a ticket that it blocks can start, because the blocked ticket adds the published package as a dependency or raises its version. The candidates are the tickets in the ticket's `crossRepositoryBlocked`. The tracker does not record whether a blocked ticket consumes the blocking repository as a published package, so judge that for each candidate from the tickets and the conversation.

4. **Print the list** as one fenced block. For each ticket, in order:
   - Its line: `lead`, then the shortened title.
   - Its `blockerLine`, when that is not null.
   - Its gate, when step 3 found one: `gateLead`, then the package's name, then `, needed by `, then the label of each candidate that consumes the package, separated by commas: `📦 publish tank, needed by wo.1000, cs.75`. Name the package rather than the repository when the two differ. When the text after `gateLead` exceeds `gateBudget` characters, break the line after a comma and indent each continuation two spaces past `gateLead`'s indent.

   A ticket's place states its blocker: It is indented under the ticket that blocks it. `blockerLine` names the blockers that the indent does not state.

   When `cycle` is not empty, add a last line inside the block: `⚠️`, then the labels of the tickets in `cycle`, then `block each other`.
