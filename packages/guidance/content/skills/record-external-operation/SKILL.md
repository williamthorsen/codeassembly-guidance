---
name: record-external-operation
description: Record an operation on a hosted service in the repository that the work serves, right after the operation succeeds. Use after creating, changing, or deleting a resource, a setting, a variable, or a credential on a hosted service on the developer's behalf.
user-invocable: true
---

# Record an external operation

Keep the record of what exists on hosted services, and how it was set up, in the repository that uses them. Each service has one document at `docs/operations/{service}.md`. The document states each resource's current state, and its history list states what changed, when, and why. Git history of the document is the full journal.

**Announce at start:** "Using record-external-operation to record this operation."

## Scope

An operation is in scope when it creates, changes, or deletes a resource, a setting, a variable, or a credential on a hosted service on the developer's behalf, through a console, a CLI, or an API.

These are out of scope:

- Reads, such as listing resources or viewing a setting.
- Operations whose record already lives in the repository or the tracker: git operations, pull requests, tickets, and comments.
- Changes to the local machine.
- Resources that the repository's infrastructure-as-code config declares, because that config is their record.

## Process

1. **Record right after the operation succeeds**, before the next operation. Record a batch of like changes to one resource, such as several variables set on one project, as one history line.

2. **Open the service's document**, `docs/operations/{service}.md` at the git top level of the repository that the work serves. Name the file for the console in which the resource is managed, as a lowercase slug: `vercel.md`, `cloudflare.md`, `firebase.md`, and `aws.md` for any AWS resource. Two products managed in one console share its document. Create the file from the template below when it does not exist.

3. **Update the resource's section.** Add a section for a new resource. For an existing one, update its current-state fields and add its history line in the same edit, so that the two do not disagree. A deleted resource keeps its section, with status `deleted` and its removal in the history.

4. **Scan for secrets:**

   ```bash
   node {harness_home_dir}/skills/record-external-operation/record-external-operation.mjs scan
   ```

   The command prints `{ ok, findings: [{ file, line, kind, excerpt }] }` and exits 1 when it finds a secret-shaped value. Fix each finding before continuing:
   - A credential's value: Replace it with the credential's variable name and storage location.
   - A false positive, such as a long identifier: Rewrite the line to name the resource by its short name or its console location instead of the flagged value.

   Never weaken a value to pass the scan, such as by truncating or splitting a token. Run the scan again until it reports `ok: true`.

5. **Commit the document with the ticket's work.** When the branch that contains the change will not merge, ask the developer which branch should take the document rather than discard it: The operation happened whether or not the code merges.

## Template

```markdown
# Vercel

## Project `storefront`

- **Status:** active
- **App:** `apps/web`
- **Console:** Vercel dashboard → `storefront` → Settings
- **Configuration:** Framework preset Next.js; production branch `main`; preview deployments for every branch.
- **Credentials:** `DATABASE_URL` and `CAPTCHA_SECRET_KEY` in the project's environment variables (production and preview); `.env.local` for local development.
- **Created:** 2026-11-22 (#42), through the dashboard, importing the GitHub repository.
- **Recreate:** Import the repository in the dashboard, set the framework preset, then set each variable under **Credentials** from its source service.
- **Remove:** Dashboard → Settings → Delete Project; then remove the variables from `.env.local`.

### History

- 2026-11-22 (#42): Created the project and set the production and preview variables.
```

Field order is fixed: status, app, console, configuration, credentials, created, recreate, remove. Omit an optional field that does not have a value, such as **App** in a repository with one deployable, rather than writing it empty.

- **Status:** `active` or `deleted`.
- **Console:** the URL or the navigation path at which a person finds the resource.
- **Credentials:** each credential by its variable name and its storage location, never its value.
- **Created:** the date, the ticket, and the route: dashboard, CLI command, or API.
- **Recreate** and **Remove:** a concrete command or console path for each.
- **History line:** `- {YYYY-MM-DD} ({ticket}): {change}`, with the ticket reference in the project's own form (`#123`, `ABC-123`), or `no ticket` when the work does not have one.

A document never contains an account email or a billing detail, because a public repository publishes it. A correction to a recorded change is a new history line, not an edit of the old one.
