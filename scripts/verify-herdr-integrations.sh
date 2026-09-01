#!/usr/bin/env bash

set -uo pipefail

failures=0

ok() {
  printf 'OK: %s\n' "$*"
}

fail() {
  failures=$((failures + 1))
  printf 'FAIL: %s\n' "$*" >&2
}

check_profile_pair() {
  profile_label=$1
  codex_dir=$2
  claude_dir=$3

  integration_output=$(CODEX_HOME="$codex_dir" \
    CLAUDE_CONFIG_DIR="$claude_dir" \
    herdr integration status 2>&1)
  integration_status=$?

  if [ "$integration_status" -ne 0 ]; then
    fail "$profile_label: herdr integration status failed"
    return
  fi

  if printf '%s\n' "$integration_output" | grep -Eq '^pi: current \(v[0-9]+\)'; then
    ok "$profile_label: Pi integration is current"
  else
    fail "$profile_label: Pi integration is not current"
  fi

  if printf '%s\n' "$integration_output" | grep -Eq '^codex: current \(v[0-9]+\)'; then
    ok "$profile_label: Codex integration is current"
  else
    fail "$profile_label: Codex integration is not current"
  fi

  if printf '%s\n' "$integration_output" | grep -Eq '^claude: current \(v[0-9]+\)'; then
    ok "$profile_label: Claude integration is current"
  else
    fail "$profile_label: Claude integration is not current"
  fi
}

if ! command -v herdr >/dev/null 2>&1; then
  fail "herdr is not on PATH"
  exit 1
fi

printf 'Herdr integration matrix\n'
check_profile_pair default "$HOME/.codex" "$HOME/.claude"
check_profile_pair account1 "$HOME/.codex-account1" "$HOME/.claude-account1"
check_profile_pair account2 "$HOME/.codex-account2" "$HOME/.claude-account2"

printf '\nSummary\n'
printf '%s failure(s)\n' "$failures"

if [ "$failures" -ne 0 ]; then
  exit 1
fi
