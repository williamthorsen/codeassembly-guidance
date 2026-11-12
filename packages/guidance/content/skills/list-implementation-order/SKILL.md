---
name: list-implementation-order
description: List the tickets created or discussed in the conversation in implementation order, as a tree for a narrow column. Invoke only when the developer asks.
disable-model-invocation: true
---

# List implementation order

Print the open tickets that the conversation created or discussed, in the order in which to implement them. A bundled helper reads the tickets, orders them, and writes the fixed part of every line. You name the tickets, shorten the titles, and mark the publish gates.

Never invoke this skill on your own initiative, and never suggest it.

## Process

1. **Collect the tickets.** List every ticket that the conversation created or discussed, in the order in which the conversation reached them. Write a GitHub ticket as `OWNER/REPO#N`, taking the repository from the ticket's URL. Give a ticket on another platform its key and its title.

   When the conversation does not contain any ticket, say so in one line and stop.

2. **Collect the dependencies that the tracker does not record.** GitHub's native blockers are read by the helper. Add an edge only for a dependency that the conversation established and that the helper cannot read: one that involves a ticket outside GitHub, or one that was agreed and not yet recorded.

3. **Run the helper.**

   ```bash
   node {harness_home_dir}/skills/implementation-order/implementation-order.mjs \
     --ticket {OWNER/REPO#N} --external "{KEY}={Title}" --edge "{BLOCKER}>{BLOCKED}"
   ```

   Repeat each flag once per ticket or edge. Each side of an edge is `OWNER/REPO#N` or a key that an `--external` declares, and the blocked side is a listed ticket. On a non-zero exit, report the helper's stderr and stop: A list that lacks a ticket misstates the order.

   The helper prints `{"tickets": [...], "omitted": [...], "cycle": [...]}`. `tickets` is in list order. `omitted` names the closed tickets, which the list leaves out.

4. **Shorten each title** to at most the ticket's `titleBudget` characters. Cut words rather than end with an ellipsis, and keep the leading verb. Leave a title that already fits as it is.

5. **Find the publish gates.** A gate follows a ticket when its change must be published, and the dependency upgraded in a consuming repository, before a ticket that it blocks can start. Look for one wherever a ticket blocks a ticket in another repository; `crossRepository` marks those among `otherBlockers`, and a child in the tree whose `repository` differs from its parent's is another. The tracker does not record whether the blocked repository consumes the blocking one as a published package, so judge that from the tickets and the conversation.

6. **Print the list** as one fenced block, and nothing else. For each ticket, in order:
   - Its line: `lead`, then the shortened title.
   - Its `blockerLine`, when that is not null.
   - Its gate, when step 5 found one: `gateLead`, then the package's name, then `, upgrade in `, then the prefix of each consuming repository in the list, separated by commas. Name the package rather than the repository when the two differ.

   A ticket's place states its blocker: It is indented under the ticket that blocks it. `blockerLine` names the blockers that the indent does not state.

   When `cycle` is not empty, add a last line inside the block: `⚠️`, then the labels of the tickets in `cycle`, then `block each other`.
