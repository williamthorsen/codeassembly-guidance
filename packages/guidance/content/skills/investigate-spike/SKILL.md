---
name: investigate-spike
description: Carry out a spike plan's investigation steps and deliver its findings artifact and the closing post on the ticket
user-invocable: true
---

# Investigate spike

Carry out a spike plan, the `## Investigation steps` / `## Deliverable` shape defined in [spike conventions](../_data/spike-conventions.md). A spike produces findings rather than a diff: The run ends with a findings artifact and either the offer of the closing post or, when the findings propose work, the recommendation of the triage round that offers it, not with commits. The skill re-resolves everything it needs from the environment, so it works the same in the session that produced the plan and in a fresh one.

## Arguments

| Flag                | Effect                                                                                                                | Default                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `--plan=<path>`     | The spike plan to carry out.                                                                                          | Auto-resolved (see below) |
| `--ticket=<source>` | The spike ticket that the plan serves. Resolved per [ticket source resolution](../_data/ticket-source-resolution.md). | Auto-resolved (see below) |

## The contract

The ticket's questions to answer and decisions to enable are the contract; the plan's steps are the mechanism by which they are met. When a step turns out not to serve them, or the facts found show a better line of inquiry, the questions decide.

The plan artifact is read-only. It records what was planned, and a later reader compares it against the findings to see how the investigation departed from it.

## Process

<!-- include: ../_partials/resolve-plan-and-ticket.md / -->

5. **Work the investigation steps in order.** A step is done when its **Answered when:** condition holds, or when it is recorded as a residual unknown. Record each step's answer and its evidence as you go: the code read, the command and its output, the measurement.

   Run throwaway probes and prototypes in a scratch directory created with `mktemp -d "${TMPDIR:-/tmp}/spike.XXXXXX"`, using the absolute path that the call prints. Commit nothing to the branch: A prototype worth keeping becomes a follow-up ticket, not a commit.

   The timebox is the spike's effort ceiling. Judge it by the effort spent against the ceiling that the plan states, and once a step clearly exceeds it, stop the step and record what it left unanswered as a residual unknown rather than extend it.

   Raise a finding that redirects the investigation, such as a false premise in a step or a question that the ticket did not ask, to the user before proceeding, rather than departing from the plan silently.

   A step that names the developer as its actor is yours to carry out, unless the step has a `**Residue:**` line: Perform every part that you can, and raise the residue as the one ask that it states. It is never a step for the developer to run, and the records of a step stay yours even when the step has a residue line.

6. **Save the findings** as a ticket-level `spike-findings` artifact per {skill:save-artifact}. It contains the answer to each of the ticket's questions to answer, the recommendation on each of its decisions to enable, the residual unknowns, and the evidence behind each answer. When the investigation proposes work, list each proposal as an item that a triage can dispose of.

7. **Report** the answers and the recommendations against the ticket's questions and decisions, naming any question left unanswered and any departure from the plan, and give the artifact's path.

8. **Close** with an action-items block:
   - When the findings propose work, recommend {skill?:triage-spike-findings} with the artifact path and the ticket, and do not offer the closing post: The triage round ends the spike and offers it, as [Closing post](../_data/spike-conventions.md#closing-post) states.
   - Otherwise, when a ticket governs the run, offer the closing post on it, with its body shown; on consent, post it as that section states.

<!-- include: ../_partials/action-items.md / -->

<!-- include: ../_partials/option-format.md / -->
