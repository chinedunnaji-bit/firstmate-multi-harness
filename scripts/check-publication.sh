#!/usr/bin/env bash

set -uo pipefail

failures=0
warnings=0

ok() {
  printf 'OK: %s\n' "$*"
}

warn() {
  warnings=$((warnings + 1))
  printf 'REVIEW: %s\n' "$*" >&2
}

fail() {
  failures=$((failures + 1))
  printf 'FAIL: %s\n' "$*" >&2
}

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$repo_root" ]; then
  fail "run this script inside the repository"
  exit 1
fi

cd "$repo_root" || exit 1

printf 'Repository state\n'
git status --short
if [ -z "$(git status --porcelain)" ]; then
  ok "worktree and index are clean"
else
  warn "repository has uncommitted or staged changes"
fi

if git diff --check && git diff --cached --check; then
  ok "working and staged diffs pass whitespace/error checks"
else
  fail "git diff check found an error"
fi

printf '\nForbidden filenames\n'
forbidden_files=$(git ls-files | grep -Ei \
  '(^|/)(auth\.json|\.env($|\.)|\.?credentials?($|\.)|\.?cookies?($|\.)|id_(rsa|dsa|ecdsa|ed25519)($|\.)|.*\.(pem|p12|pfx|key))$' \
  || true)
if [ -n "$forbidden_files" ]; then
  printf '%s\n' "$forbidden_files" >&2
  fail "tracked files include a credential-like filename"
else
  ok "no credential-like filenames are tracked"
fi

printf '\nHigh-confidence secret patterns\n'
secret_hits=$(git grep -nEI \
  '(-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})' \
  -- . ':!scripts/check-publication.sh' 2>/dev/null \
  | cut -d: -f1,2 || true)
if [ -n "$secret_hits" ]; then
  printf '%s\n' "$secret_hits" >&2
  fail "high-confidence secret-like content found; inspect the listed lines locally"
else
  ok "no high-confidence secret pattern found"
fi

printf '\nGeneric security-word review\n'
review_hits=$(git grep -nEi \
  'api[_-]?key|token|secret|password|authorization|bearer' \
  -- . 2>/dev/null | cut -d: -f1,2 || true)
if [ -n "$review_hits" ]; then
  printf '%s\n' "$review_hits"
  warn "generic security words exist at the listed file:line locations; inspect them before pushing"
else
  ok "no generic security-word matches"
fi

printf '\nPersonal absolute paths\n'
personal_paths=$(git grep -n '/Users/' -- . \
  ':!scripts/check-publication.sh' 2>/dev/null | cut -d: -f1,2 || true)
if [ -n "$personal_paths" ]; then
  printf '%s\n' "$personal_paths" >&2
  fail "macOS /Users paths remain; replace personal paths with $HOME where practical"
else
  ok "no /Users absolute path is tracked"
fi

printf '\nPublication placeholders\n'
placeholder_hits=$(git grep -nE '<repository-name>|<github-owner>' -- . \
  ':!scripts/check-publication.sh' 2>/dev/null | cut -d: -f1,2 || true)
if [ -n "$placeholder_hits" ]; then
  printf '%s\n' "$placeholder_hits" >&2
  fail "publication placeholders remain; replace them after the repository name is selected"
else
  ok "no repository-name/owner placeholders remain"
fi

printf '\nStaged surface\n'
git diff --cached --stat
printf '%s\n' 'Before a public push, manually inspect the complete staged patch with:'
printf '%s\n' '  git diff --cached'

printf '\nSummary\n'
printf '%s failure(s), %s review item(s)\n' "$failures" "$warnings"

if [ "$failures" -ne 0 ]; then
  exit 1
fi
