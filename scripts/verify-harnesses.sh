#!/usr/bin/env bash

set -uo pipefail

failures=0
warnings=0

ok() {
  printf 'OK: %s\n' "$*"
}

warn() {
  warnings=$((warnings + 1))
  printf 'WARN: %s\n' "$*" >&2
}

fail() {
  failures=$((failures + 1))
  printf 'FAIL: %s\n' "$*" >&2
}

check_wrapper() {
  wrapper_name=$1
  wrapper_path=$(command -v "$wrapper_name" 2>/dev/null || true)
  if [ -z "$wrapper_path" ]; then
    fail "$wrapper_name executable wrapper is not on PATH"
    return
  fi

  if [ ! -f "$wrapper_path" ] || [ ! -x "$wrapper_path" ]; then
    fail "$wrapper_name does not resolve to an executable regular file"
    return
  fi

  if ! bash -n "$wrapper_path"; then
    fail "$wrapper_name has invalid Bash syntax"
    return
  fi

  if ! "$wrapper_path" --version >/dev/null 2>&1; then
    fail "$wrapper_name does not preserve a working --version invocation"
    return
  fi

  ok "$wrapper_name wrapper is executable, syntactically valid, and preserves arguments"
}

check_codex_profile() {
  profile_label=$1
  profile_dir=$2

  if [ ! -d "$profile_dir" ]; then
    fail "Codex $profile_label directory is missing"
    return
  fi

  if CODEX_HOME="$profile_dir" codex login status >/dev/null 2>&1; then
    ok "Codex $profile_label vendor login status succeeds"
  else
    fail "Codex $profile_label is not logged in"
  fi

  quota_json=$(CODEX_HOME="$profile_dir" \
    quota-axi --provider codex --json --no-credential-refresh 2>/dev/null)
  quota_status=$?
  if [ "$quota_status" -eq 0 ] && printf '%s\n' "$quota_json" | \
    jq -e '.providers[0].state.status == "fresh" and (.providers[0].state.stale == false)' \
      >/dev/null 2>&1; then
    ok "Codex $profile_label has fresh strict read-only quota evidence"
  else
    fail "Codex $profile_label quota is not fresh; reauthenticate with this CODEX_HOME"
  fi
}

check_claude_profile() {
  profile_label=$1
  profile_dir=$2

  if [ ! -d "$profile_dir" ]; then
    fail "Claude $profile_label directory is missing"
    return
  fi

  auth_json=$(CLAUDE_CONFIG_DIR="$profile_dir" claude auth status --json 2>/dev/null)
  auth_status=$?
  if [ "$auth_status" -eq 0 ] && printf '%s\n' "$auth_json" | \
    jq -e '.loggedIn == true' >/dev/null 2>&1; then
    ok "Claude $profile_label vendor login status succeeds"
  else
    fail "Claude $profile_label is not logged in"
  fi

  quota_json=$(CLAUDE_CONFIG_DIR="$profile_dir" \
    quota-axi --provider claude --json --no-credential-refresh 2>/dev/null)
  quota_status=$?
  if [ "$quota_status" -eq 0 ] && printf '%s\n' "$quota_json" | \
    jq -e '.providers[0].state.status == "fresh" and (.providers[0].state.stale == false)' \
      >/dev/null 2>&1; then
    ok "Claude $profile_label has fresh strict read-only quota evidence"
  else
    fail "Claude $profile_label quota is not fresh; login or grant quota-axi one-time Keychain access"
  fi
}

printf 'Harness executables\n'
for harness_name in pi codex claude; do
  if command -v "$harness_name" >/dev/null 2>&1; then
    ok "$harness_name is on PATH"
  else
    fail "$harness_name is not on PATH"
  fi
done

printf '\nAutomation-safe account wrappers\n'
for wrapper_name in codex1 codex2 claude1 claude2; do
  check_wrapper "$wrapper_name"
done

printf '\nPi coordinator model access\n'
pi_models=$(pi --offline --list-models 2>&1)
pi_models_status=$?
if [ "$pi_models_status" -eq 0 ] \
  && ! printf '%s\n' "$pi_models" | grep -q 'No models available'; then
  ok "Pi reports at least one offline catalog model from configured credentials"
else
  fail "Pi has no configured coordinator model; start pi and use /login"
fi

printf '\nCodex profiles\n'
check_codex_profile default "$HOME/.codex"
check_codex_profile account1 "$HOME/.codex-account1"
check_codex_profile account2 "$HOME/.codex-account2"

printf '\nClaude profiles\n'
check_claude_profile default "$HOME/.claude"
check_claude_profile account1 "$HOME/.claude-account1"
check_claude_profile account2 "$HOME/.claude-account2"

printf '\nSummary\n'
printf '%s failure(s), %s warning(s)\n' "$failures" "$warnings"

if [ "$failures" -ne 0 ]; then
  exit 1
fi
