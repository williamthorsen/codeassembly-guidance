# External-operation helper

`src/record-external-operation/` contains the helper that the `record-external-operation` skill runs, bundled to `content/skills/record-external-operation/record-external-operation.mjs`. It scans a repository's operations documents for secret-shaped values. It does not write any file: The skill edits the documents.

## Command

`scan [--root <dir>]` reads every Markdown file under `<root>/docs/operations/`, recursively, and prints one JSON result to stdout:

```json
{ "ok": false, "findings": [{ "file": "docs/operations/vercel.md", "line": 7, "kind": "known-prefix", "excerpt": "sk-…" }] }
```

`<root>` defaults to the git top level of the working directory. A missing `docs/operations/` directory yields an empty `findings` list. `--help` prints the usage.

A finding's `kind` is one of these:

- `known-prefix`: a token with a known credential prefix, such as `sk-`, `ghp_`, `AKIA`, or `npm_`, followed by a value of that credential's shape. A bare prefix in prose does not match.
- `jwt`: three base64url segments, the first starting `eyJ`.
- `private-key`: a `-----BEGIN … PRIVATE KEY-----` line.
- `url-credentials`: a URL of the form `scheme://user:password@`.
- `high-entropy`: a run of at least 32 base64 characters that contains an uppercase letter, a lowercase letter, and a digit, and scores at least 4.5 bits of entropy per character. Hex IDs, UUIDs, and git SHAs cannot reach that score. Inside a URL, each `/`-delimited path segment is scored on its own.

`excerpt` does not reveal the value: It is the prefix for `known-prefix`, the `BEGIN` line for `private-key`, `scheme://user:…` for `url-credentials`, and the first four characters for the other kinds. `secrets.ts` defines the patterns.

## Exit codes

- 0: no findings.
- 1: findings, after printing the result; or a failure, such as a working directory outside a git repository without `--root`.
- 2: a usage error.
