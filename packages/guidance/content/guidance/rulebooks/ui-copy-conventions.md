---
slug: ui-copy-conventions
description: 'Text in a product surface: written for the person who returns to the page, with rules for vocabulary, labels, helper text, errors, and empty states, a copy budget, and a closing check. Consult before writing labels, helper text, messages, or empty states for a page, a prototype, or a UI component. Not for tours, onboarding decks, or other presentational content.'
delivery: [skill]
version: '5'
---

# UI copy conventions

A tool page is written for the person who uses it every week, not for a first-time visitor. Copy that introduces the page, sells it, or walks through it is text that this person reads past on every visit, and a sentence that declares the task finished decides something that is theirs to decide. These conventions apply to a prototype or a mockup exactly as they apply to a released interface.

Presentational content is outside these conventions: a tour, an onboarding deck, a walkthrough, or other content that introduces the product to a reader who has not used it yet, usually once. Its titles state what the reader gains, its leads show that gain with a concrete example, and it may address the reader. When the agent's guidance includes a plain-speech rule, that rule's carve-out for presentational text applies to such content. The controls of a tour, such as its buttons and its step counter, are product surface and follow these conventions.

When a project names its own content guidelines, such as a design system's, those guidelines take precedence when the two conflict.

## Rules

- **Labels** are nouns that name their object and read without their surroundings, and two controls on one view never share a label. **Buttons** are verbs that name the action that they perform, except a toggle, whose label names what it governs and stays the same in both states, as {rulebook:accessibility-conventions} states. Example: ❌ "Connection", "Remember", and two buttons named "Select file". ✅ "Database connection", "Remember this device", "Select source file", and "Select target file".
- **Vocabulary.** One thing has one name across the product, and that name is the reader's word, never the implementation's: A package name or a formal term is not the reader's word. Example: ❌ A settings file called by its package's name, and a condition called a "Guard". ✅ "Settings file" and "Condition", used the same way on every view.
- **Helper text** states a constraint or a consequence: the format that a field accepts, or what an action changes. The explanation that the consequence-at-the-control rule of {rulebook:accessibility-conventions} requires counts toward the copy budget's one line of helper text.
- **An error** names the problem and the fix, in text that the page writes. A model's sentence or a system's message is the detail beneath that text, never the whole message. A message about a failed or a cancelled action also states what the attempt changed or cost; the consequence-at-the-control rule of {rulebook:accessibility-conventions} states that cost before the action. Example: ❌ A raw module-load error, or a cancelled job that stays charged and says nothing. ✅ "The converter could not start. Reinstall it from Settings." with the system's message under "Details", and "Cancelled. The 2 credits already used are not refunded."
- **Register.** A sentence never explains the page, reassures, congratulates, or narrates the reader ("you are done", "you can…").
- **Minimizers.** Leave out "simply" and "just".
- **Case.** Labels, buttons, headings, and messages take sentence case.

## Copy budget

- A page does not open with an intro paragraph.
- A control has at most one line of helper text.
- An empty state has one line.

## Example

Under the heading of an API-token page:

- ❌ "Make a token from a preset or one of your sets, give it a name, and you are done."
- ✅ Nothing under the heading. Under the name field: "Shown in the token list. Not secret."

## Checking

Check the copy of each new or changed view before reporting it finished or reviewed. Confirm each of these, starting with the two rules most often missed:

- Each field's helper text states the format that the field accepts, when the field accepts a format.
- Each error names the problem and the fix in text that the page writes.
- Each label names its object, reads without its surroundings, and is unique on its view, and each thing keeps one name across the product.
- Each message about a failed or a cancelled action states what the attempt changed or cost.
- The register, the minimizer, the case, and the copy-budget rules hold.
