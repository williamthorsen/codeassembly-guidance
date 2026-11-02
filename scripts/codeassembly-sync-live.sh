#!/usr/bin/env bash
set -euo pipefail

# codeassembly-sync-live.sh: Fast-forwards the guidance live worktree to a commit and deploys guidance from it.
#
# The worktree checked out on the `live` branch is the one from which the machine's deployed guidance is built.
# This script fetches `origin`, resolves the ref to one commit, fast-forwards `live` to it, and builds that worktree.
# It then builds the `live` worktree of the CodeAssembly packages repository, without fetching or advancing it, and
# runs that worktree's `codeassembly` binary for `install` and `sync --global`. It deploys even when `live` is already
# at the commit, so a rerun completes a deploy that failed partway.
#
# Usage:
#   codeassembly-sync-live [<ref>]
#   codeassembly-sync-live --help

readonly PROG="$(basename "$0")"
readonly DEFAULT_REF="origin/main"
readonly LIVE_BRANCH_REF="refs/heads/live"
readonly CLI_BIN_PATH="packages/agents/bin/codeassembly.js"

# BASH_SOURCE names this file when run by path and the ~/.local/bin link when run as a command; resolving the link
# locates the repository whose live worktree this script deploys.
_self="${BASH_SOURCE[0]}"
[[ "$_self" != */* ]] && _self="$(command -v "$_self")"
# `readlink` reports an unresolvable path with exit 1 and no message, and an older one rejects -f outright; `|| true`
# keeps either failure from ending the script before the check below can name the path.
_self="$(readlink -f "$_self")" || true
if [[ -z "$_self" ]]; then
  echo "$PROG: cannot resolve its own path from ${BASH_SOURCE[0]}" >&2
  exit 1
fi
repo_dir="$(cd "$(dirname "$_self")" && git rev-parse --show-toplevel 2>/dev/null)" || true
if [[ -z "$repo_dir" ]]; then
  echo "$PROG: cannot locate the guidance repository from $_self" >&2
  exit 1
fi
readonly repo_dir

# Main flow
main() {
  local ref=""

  # Parse options
  while [[ $# -gt 0 ]]; do
    case "$1" in
    -h | --help) show_usage 0 ;;
    -*) die_with_usage "unknown option $1" 2 ;;
    *)
      [[ -z "$ref" ]] || die_with_usage "unexpected argument $1" 2
      ref="$1"
      ;;
    esac
    shift
  done
  ref="${ref:-$DEFAULT_REF}"

  # Check dependencies
  local cmd
  for cmd in git node pnpm; do
    command -v "$cmd" &>/dev/null || die "required command '$cmd' not found" 127
  done

  # Locate the packages repository's live worktree, which provides the CLI
  local cli_dir
  cli_dir="$(find_cli_worktree)" || die "no CodeAssembly live worktree containing $CLI_BIN_PATH at $(describe_cli_worktree)
  Set CODEASSEMBLY_LIVE_DIR to the worktree of williamthorsen/codeassembly that has live checked out; live is unchanged"

  # Locate the live worktree
  local live_dir
  live_dir="$(find_live_worktree)"
  if [[ -z "$live_dir" ]]; then
    die "no worktree of $repo_dir has the live branch checked out
  Create it with: git -C $repo_dir worktree add $repo_dir.live live"
  fi

  git -C "$live_dir" fetch --quiet origin || die "cannot fetch origin; live is unchanged"

  # Resolve the ref once, so that the checks and the merge act on the same commit
  local sha
  sha="$(git -C "$live_dir" rev-parse --verify --quiet "$ref^{commit}")" ||
    die_with_usage "unknown ref '$ref'" 2

  [[ -z "$(git -C "$live_dir" status --porcelain)" ]] ||
    die "the live worktree at $live_dir has uncommitted changes; live is unchanged"

  local old_sha
  old_sha="$(git -C "$live_dir" rev-parse HEAD)"
  git -C "$live_dir" merge-base --is-ancestor HEAD "$sha" ||
    die "live cannot fast-forward to '$ref'; live is unchanged"

  git -C "$live_dir" merge --ff-only --quiet "$sha"
  if [[ "$old_sha" == "$sha" ]]; then
    echo "live is already at ${sha:0:8} ($ref)."
  else
    echo "Advanced live from ${old_sha:0:8} to ${sha:0:8} ($ref)."
  fi

  # Build both live worktrees, then deploy with the packages repository's CLI
  local bin="$cli_dir/$CLI_BIN_PATH"
  run_deploy_step "install guidance dependencies" "$live_dir" pnpm install --frozen-lockfile
  run_deploy_step "build guidance" "$live_dir" pnpm exec nmr build
  run_deploy_step "install CLI dependencies" "$cli_dir" pnpm install --frozen-lockfile
  run_deploy_step "build CLI" "$cli_dir" pnpm exec nmr build
  run_deploy_step "codeassembly install" "$live_dir" node "$bin" install --link
  run_deploy_step "codeassembly sync --global" "$live_dir" node "$bin" sync --global
  echo "Deployed guidance from live at ${sha:0:8}."
}

# region | Helper functions

# Prints a message to stderr and exits with the given status, defaulting to 1.
die() {
  echo "$PROG: $1" >&2
  exit "${2:-1}"
}

# Prints a message and the usage to stderr, then exits with the given status, defaulting to 1.
die_with_usage() {
  echo "$PROG: $1" >&2
  show_usage "${2:-1}"
}

# Prints where the packages repository's live worktree is looked for, naming the source of the path.
describe_cli_worktree() {
  if [[ -n "${CODEASSEMBLY_LIVE_DIR:-}" ]]; then
    echo "$CODEASSEMBLY_LIVE_DIR (from CODEASSEMBLY_LIVE_DIR)"
  else
    echo "$(dirname "$repo_dir")/codeassembly.live (the sibling path)"
  fi
}

# Prints the path of the packages repository's live worktree, or fails when that path doesn't contain the CLI.
find_cli_worktree() {
  local dir="${CODEASSEMBLY_LIVE_DIR:-$(dirname "$repo_dir")/codeassembly.live}"
  [[ -f "$dir/$CLI_BIN_PATH" ]] || return 1
  echo "$dir"
}

# Prints the path of the worktree that has the live branch checked out, or nothing when none does.
find_live_worktree() {
  git -C "$repo_dir" worktree list --porcelain | awk -v branch="$LIVE_BRANCH_REF" '
    /^worktree / { path = substr($0, 10) }
    $0 == "branch " branch { print path; exit }
  '
}

# Runs one deploy step in a directory, naming the step and how to resume when it fails.
run_deploy_step() {
  local label="$1" dir="$2"
  shift 2
  echo "==> $label"
  (cd "${dir:?}" && "$@") || {
    echo "$PROG: deploy step '$label' failed" >&2
    echo "  live is already advanced; rerun $PROG to resume the deploy." >&2
    exit 1
  }
}

# Displays command-line syntax. Can exit with or without an error code.
show_usage() {
  cat >&2 <<USAGE
Fast-forward the guidance live worktree to a commit and deploy guidance from it.

Usage:
  $PROG [<ref>]
  $PROG --help

Arguments:
  <ref>       A SHA, branch, or tag (default: $DEFAULT_REF)

Options:
  -h, --help  Show this help

Environment:
  CODEASSEMBLY_LIVE_DIR  The live worktree of williamthorsen/codeassembly,
                         which provides the CLI (default: codeassembly.live
                         beside this repository's worktree)

Fetches origin, resolves <ref> to one commit, and fast-forwards live to it.
Then runs pnpm install --frozen-lockfile and nmr build in the live worktree
and in the CodeAssembly live worktree, which it neither fetches nor advances.
Last, it runs the CodeAssembly worktree's codeassembly binary for
install --link and sync --global from the live worktree. It deploys even when
live is already at the commit.

Exit status:
  0    live is at the commit and the deploy succeeded
  1    the fetch failed, either live worktree is missing, the live worktree
       has uncommitted changes, live cannot fast-forward to the commit, or a
       deploy step failed
  2    usage error, including an unknown ref
  127  git, node, or pnpm is not installed

Examples:
  $PROG
  $PROG 5bab2e28
USAGE
  exit "${1:-1}"
}
# endregion | Helper functions

main "$@"
