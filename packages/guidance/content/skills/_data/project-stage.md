# Project stage

A project declares its stage in its own `.agents/preferences.yaml`, under `project`, and the session-context manifest reports each value as `project_maturity`, `project_sensitivity`, and `project_audience`, `null` when the project does not declare it. A subdirectory, such as one experiment in a repository of experiments, declares its own stage as an entry of `project.stages`: a `path` relative to the repository root and the keys that it overrides. The manifest reports the entries as `project_stages`, each with the values that it inherits from the project filled in. The global preferences file never supplies a stage, because a stage describes one repository or a part of one.

The stage that governs a piece of work is the entry whose `path` contains the work's paths, matched at a directory boundary, with the longest containing path winning; a path under no entry takes the project's stage. When the work touches paths under more than one stage, each key takes its most demanding value among them. The table below lists each key's values from the least demanding to the most.

## Values

| Key           | Value          | Meaning                                                                          |
| ------------- | -------------- | -------------------------------------------------------------------------------- |
| `maturity`    | `exploration`  | The output's shape is still being found, and nothing depends on it yet.          |
|               | `hobby`        | Built for the owner's own use or learning; breakage costs only the owner's time. |
|               | `early`        | In use by others, but the shape is still changing; downtime is tolerated.        |
|               | `production`   | Others depend on it; downtime and data loss have real costs.                     |
| `sensitivity` | `low`          | Nothing that would harm anyone if published.                                     |
|               | `personal`     | Personal data about the owner or identifiable individuals.                       |
|               | `confidential` | Secrets, credentials, or data that a third party is obliged to protect.          |
| `audience`    | `owner`        | Only the repo's owner uses it.                                                   |
|               | `team`         | A known, bounded group uses it.                                                  |
|               | `public`       | Anyone who can reach it uses it.                                                 |

## What each value implies

- **Security.** `owner` with `low` sensitivity needs only what keeps the owner's own credentials out of the repository; access control beyond the host's own login is machinery without an asset to protect. `personal` data warrants access limited to the people that it concerns. Authentication with several factors, rate limits, and origin checks are needed for `public` users or `confidential` data.
- **Availability.** `hobby` tolerates a service that runs only while the owner works, such as a local process or a database on the owner's machine. `early` tolerates downtime and manual recovery. Hosted, always-available infrastructure and backups are needed for `production`.
- **Infrastructure.** Choose the least infrastructure on which the project runs at its declared stage: a file before a database, a local process before a hosted service, one environment before several.
- **Verification.** An output is unsettled while the governing maturity is `exploration`, or while the work is a spike, a proof of concept, a prototype, or an agent whose output the developer has not approved. While an output is unsettled, the developer judges it by reading it on real inputs, starting from the user's own example of the output when one exists. Golden references, answer keys, gated evals, and exhaustive fixtures wait until the developer approves an output as the target, and are frozen from it; any built earlier are provisional, not a contract. Unit tests of the deterministic code around the output are outside this rule.

## Rules

- **The declared values are premises.** Design for the stage that the project declares, not for the stage that a general-purpose system would assume. A design that serves requirements beyond the declared stage is wrong for this project, however sound it would be elsewhere.
- **Default to the least machinery that works for the declared stage.** Read [design priorities](design-priorities.md) against the stage: Behavioral correctness covers the cases that matter at that stage.
- **Escalate only for a named asset or need.** Add security, availability, or infrastructure beyond what the stage implies only when the design names what it protects or serves, such as "the tokens table holds the owner's API keys". State the asset or need in the ticket.
- **Make added hardening switchable.** A safeguard added beyond the stage, such as an origin check or a rate limit, is switched by configuration, so that a preview deployment or a local run can work without it.
- **Ask for an undeclared value; never infer it.** An undeclared value is a preference for which the agent holds no evidence, so it is in the gated class: Ask the developer rather than infer enterprise requirements from silence. Ask about verification only when the answer decides it: Work that is unsettled by its kind, such as a spike, does not need the maturity. Once the developer answers, declare the value in the project's `.agents/preferences.yaml`, under `project.stages` when it describes a subdirectory, and run `node {harness_home_dir}/scripts/validate-preferences.mjs` on the edited file, so that the question is asked once.
- **Record the premises.** State each value that decided a security, availability, infrastructure, or verification question where the work records its decisions: in a ticket's `## Context`, one sentence per premise naming the value and the decision that it settled, and in a product's design doc.
