---
name: convert-agent-prompt
description: Convert an agent's prompt file into an agent-logic file, which an agent-logic viewer renders as a statechart. Use when asked to convert, chart, or extract the logic of an agent prompt.
standalone: wanted only in projects that convert agent prompts, too rarely to justify a standing skill-index line
user-invocable: true
---

# Convert an agent prompt

Convert a prompt file into an agent-logic file: an XState v5 machine config that contains the prompt's logic and nothing else. You write a draft that quotes the prompt; the `convert` command of the `codeassembly-agent-logic` package turns it into the config, deriving offsets and ids, and refuses to write a config that is not valid.

Every command runs version 0.1.0 of the package through `pnpm dlx`, so that the extraction rules that you read match the procedure below.

## Arguments

- The prompt file (required).
- The output path (optional). Default: beside the prompt, `<base>.agent-logic.json`, where `<base>` is the prompt file's name without its extension.
- The problems path (optional): where the script writes the problems of a draft that it cannot convert, or the out-of-scope verdict.

## Prerequisites

- `pnpm` on the path.
- Access to the npm registry, from which `pnpm dlx` fetches the package on its first run.
- Write access to pnpm's dlx cache. A sandbox that denies it fails the first command with `Operation not permitted`; retry the command outside the sandbox through the permission gate.

## Procedure

1. Read the prompt file in full.
2. Print the extraction rules, and read them in full:

   ```shell
   pnpm dlx codeassembly-agent-logic@0.1.0 rules
   ```

   Judge whether the prompt is out of scope by their condition, then write the draft that they describe, or the out-of-scope draft, to `$TMPDIR/<base>.draft.json`.

3. Unless the draft is out of scope, check it against the prompt before running the script, and correct it where the check fails:
   - **Coverage.** Read the prompt again from the top, one paragraph or list item at a time, and write a coverage map to `$TMPDIR/<base>.coverage-map.json`: a JSON array with an entry `{ "quote": "...", "element": "..." }` for each instruction in it. The `quote` copies the instruction verbatim and occurs in the prompt exactly once. The `element` names the state, action, or transition that holds it, or is `ambient`, `unconverted`, or `none`. A list item or paragraph that states three instructions takes three entries. Include the instructions inside a dense step, each of which is an action of that step's state, and the rules of a section that states how to format output, such as an option format. Add each instruction whose entry names `none` to the draft where the rules' "What to extract", "Ambient instructions", and "Passages you cannot convert" place it, and name its element in the entry.
   - **Map check.** Run the coverage check:

     ```shell
     pnpm dlx codeassembly-agent-logic@0.1.0 check-coverage {prompt file} {map file}
     ```

     If it exits 1, it lists each block of the prompt that no entry quotes, as `line <N>: <opening words>`, and each entry whose quote does not occur exactly once. Map every instruction of each listed block, holding it in the draft as the Coverage bullet says, lengthen each listed quote until it occurs once, and run the check again. After the third run, go on to the next check, whatever the map check reports, and keep the `line` lines of its last run for the report. If it exits 2, handle it as step 7 states.

   - **Inputs.** List each input that the prompt tells the agent to read, fetch, or receive, such as a page, a list, or a field of the request. For each one, find an element that uses what the input supplies: a later action, a guard, or an ambient rule. Record an `unused-input` finding, as the rules' "Findings" section states, for each input that no element uses.
   - **Inferred quotes.** Read the quote of each element that has `meta.inferred` on its own, and ask whether those words name the element, as the rules' "Quotes" section requires. Replace a quote that names a neighbouring step or the question that precedes the element.
4. Run the script:

   ```shell
   pnpm dlx codeassembly-agent-logic@0.1.0 convert {prompt file} {draft file} {output file}
   ```

   When a problems path is given, add `--problems-file {problems path}` before `{prompt file}`.

5. If the script exits 1, it lists each problem by its path in the draft. Correct every listed entry in the draft and run it again. Repeat until it exits 0 or 3, for at most 5 runs. If the fifth run exits 1, stop, delete the draft file and the map file, and report the problems that it listed.
6. If the script exits 3, it wrote no config. Do not run it again: Delete the draft file, then report that the prompt is out of scope, with the reason.
7. If either command exits 2, an argument or file is wrong, and it names the problem on stderr. Correct the argument or file and run the command again; if you cannot correct it, stop, delete the draft file and the map file, and report the message.
8. If the script exits 0, delete the draft file and the map file, then report the output path, the number of ambient instructions, the number of findings of each kind, the passages listed under `meta.unconverted`, and the blocks that the map check still listed on its last run, as it printed them.
