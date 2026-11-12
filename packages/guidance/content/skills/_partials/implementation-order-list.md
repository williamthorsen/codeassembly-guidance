## Implementation-order list

Print open tickets in the order in which to implement them, as a tree for a narrow column. The step that links here names the tickets, in the order in which it reached them, an `--external` entry for each ticket outside GitHub, and an `--edge` for each dependency that the tracker does not record. A bundled helper reads the tickets, orders them, and writes the fixed part of every line. You shorten the titles and mark the publish gates.

1. **Run the helper.**

   ```bash
   node {harness_home_dir}/skills/implementation-order/implementation-order.mjs \
     --ticket {OWNER/REPO#N} --external "{KEY}={Title}" --edge "{BLOCKER}>{BLOCKED}"
   ```

   Write a GitHub ticket as `OWNER/REPO#N`, taking the repository from the ticket's URL. Repeat each flag once per ticket or edge. Each side of an edge is `OWNER/REPO#N` or a key that an `--external` declares, and the blocked side is a listed ticket. On a non-zero exit, report the helper's stderr and do not print the list: A list that lacks a ticket misstates the order.

   The helper prints `{"tickets": [...], "omitted": [...], "cycle": [...]}`. `tickets` is in list order. `omitted` names the closed tickets, which the list leaves out.

2. **Shorten each title** to at most the ticket's `titleBudget` characters. Cut words rather than end with an ellipsis, and keep the leading verb. Leave a title that already fits as it is.

3. **Find the publish gates.** A gate follows a ticket when its change must be published, and the dependency upgraded in a consuming repository, before a ticket that it blocks can start. Look for one wherever a ticket blocks a ticket in another repository; `crossRepository` marks those among `otherBlockers`, and a child in the tree whose `repository` differs from its parent's is another. The tracker does not record whether the blocked repository consumes the blocking one as a published package, so judge that from the tickets and the conversation.

4. **Print the list** as one fenced block. For each ticket, in order:
   - Its line: `lead`, then the shortened title.
   - Its `blockerLine`, when that is not null.
   - Its gate, when step 3 found one: `gateLead`, then the package's name, then `, upgrade in `, then the prefix of each consuming repository in the list, separated by commas. Name the package rather than the repository when the two differ.

   A ticket's place states its blocker: It is indented under the ticket that blocks it. `blockerLine` names the blockers that the indent does not state.

   When `cycle` is not empty, add a last line inside the block: `⚠️`, then the labels of the tickets in `cycle`, then `block each other`.
