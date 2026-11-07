---
slug: machine-readable-output-conventions
description: 'Results that a program shows to a person and that an agent or a script also reads: one result object under every renderer, the scope test, canonical values, the command-line case, structured data beside a result on a page, formats, sensitive fields, a journal of domain events, and the TypeScript packages that implement them. Consult before writing a command, a page, a dialog, or a component that shows a person a result, a report, or a confirmation, and before building an app whose state an agent or an end-to-end test verifies.'
delivery: [skill]
version: '2'
---

# Machine-readable output conventions

A result that a program shows to a person has a second reader: an agent or a script that drives the program and needs the same facts as data. When the facts exist only in their presentational form, that reader parses prose or an accessibility tree, and the parse breaks when the wording or the formatting changes. These rules make every such result available in both forms without letting the two disagree.

These rules apply whatever language, framework, or library implements them.

## Principle

- **A result is one object.** The program's logic produces it, and every form of it, for a person or for a machine, is a renderer over that object.
- **Every renderer reads the same object.** Two renderers cannot disagree about a fact, because neither one computes it, and each renderer can be tested without running the program.

## Scope

- **The rules cover a result that a person would otherwise transcribe:** a created thing, a report, a check outcome, or a confirmation.
- **They cover a view of state that an agent needs in order to verify its own action**, such as the record that a form submission changed.
- **They do not cover a screen's ordinary content**, such as a table, a list, or a tooltip.

## Canonical values

Each value in the object is in canonical form, and a renderer for a person formats it.

- **Timestamps** are ISO 8601 with an offset.
- **Numbers** are unformatted, and the field name states the unit: `ttlSeconds: 604800`, not `ttl: "7 days"`.
- **References** are ids, not display names.
- **Enumerated values** are codes, not labels.

Example, for the expiry of a created token:

- ❌ `{"expires": "Nov 12, 2026 (in 7 days)"}`
- ✅ `{"expiresAt": "2026-11-12T00:00:00Z"}`, which the dialog renders as "Nov 12, 2026 (in 7 days)"

## Command-line output

A command-line tool exposes its result through `--json`, as the "JSON output" section of {rulebook:cli-conventions} states, and splits its logic from its presentation as that rulebook's "Logic and presentation" section states.

## Results on a page

A result that a page shows to a person is also available as structured data, in two forms that serialize the same object:

- **A revealable element.** A tab, a pane, or a drawer beside the result shows the data and copies it with one click.
- **Embedded data.** The page embeds the data in the DOM, in a `<script type="application/json">` element or a `data-` attribute on the result's container, so that a driven browser reads it without revealing or clicking anything.

The embedded data is part of the page's interface: A published field follows the same rule that {rulebook:cli-conventions} states for a field of `--json` output.

## Formats

- **JSON is required.** It is the canonical, lossless form, and it is the form that the page embeds.
- **YAML and Markdown are optional renderers** over the same object. Because a YAML renderer adds a dependency, an app includes one only when a person asks for it.

## Sensitive fields

- **The result type marks a sensitive field**, such as a secret.
- **The copy and the embedded data redact a sensitive field by default.** Embedded data reaches page snapshots, test traces, and logs, which outlive the page and reach readers other than the person viewing it.
- **Including a sensitive field is an explicit act**, such as turning on an "Include secret" control beside the copy.
- **Redacted data names what it leaves out**, so that a reader can tell a redacted field from an absent one.

Example, for the copy of a created token:

- ❌ "Copy JSON" copies the token with its secret.
- ✅ "Copy JSON" copies the token without `secret` and with `"redacted": ["secret"]`, until the person turns on "Include secret".

## Journal

An app that an agent or an end-to-end test must verify after a person's actions keeps a journal of what those actions did.

- **An entry records a domain event, not a raw action:** "token created", not "button clicked".
- **A pure function derives each entry** from the state before the action, the action, and the state after it.
- **An entry has an id, a timestamp, a type, the ids of its subjects, and canonical data.** The sentence that a person reads and the JSON are two renderers over the entry.
- **The app never reads its journal to compute state.** The state stays the one source of truth, and the journal records what changed in it.
- **The journal is a test oracle.** An end-to-end test or an agent reads it to confirm what happened, and the app exposes it as it exposes any other result.

## TypeScript packages

Three packages implement these rules, and an implementation in TypeScript starts from them. For another language, or for an app that cannot take the dependency, the rules above remain the contract. Each package's README states its API.

- **[`@williamthorsen/readout`](https://github.com/williamthorsen/showroom/tree/main/packages/readout#readme)** supplies the result type, which marks its sensitive fields, a JSON serializer that redacts them and names what it leaves out, the escaping that embedded data needs, and typed renderers over the result. It implements "Formats", "Sensitive fields", and the embedded data of "Results on a page".
- **[`@williamthorsen/readout-journal`](https://github.com/williamthorsen/showroom/tree/main/packages/readout-journal#readme)** supplies a journal that a wrapped reducer derives from each state transition, its JSON form, and a renderer for each entry type. It implements "Journal".
- **[`@williamthorsen/readout-react`](https://github.com/williamthorsen/showroom/tree/main/packages/readout-react#readme)** supplies React components for a copy button, a JSON view, a view that reveals a result's data beside the result, and a drawer that lists the journal. It implements the revealable element of "Results on a page" in a React app.
