---
name: list-implementation-order
description: List the tickets created or discussed in the conversation in implementation order, as a tree for a narrow column. Invoke only when the developer asks.
disable-model-invocation: true
---

# List implementation order

Print the open tickets that the conversation created or discussed, in the order in which to implement them. You name the tickets, and the [implementation-order list](#implementation-order-list) section renders them.

Never invoke this skill on your own initiative, and never suggest it.

## Process

1. **Collect the tickets.** List every ticket that the conversation created or discussed, in the order in which the conversation reached them. Give a ticket outside GitHub its key and its title.

   When the conversation does not contain any ticket, say so in one line and stop.

2. **Collect the dependencies that the tracker does not record.** GitHub's native blockers are read by the helper. Add an edge only for a dependency that the conversation established and that the helper cannot read: one that involves a ticket outside GitHub, or one that was agreed and not yet recorded.

3. **Print the list** per [implementation-order list](#implementation-order-list), and nothing else. When the helper exits non-zero, stop after reporting its stderr.

<!-- include: ../_partials/implementation-order-list.md / -->
