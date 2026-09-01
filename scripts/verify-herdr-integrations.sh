#!/usr/bin/env bash

set -uo pipefail
set -f

failures=0
codex_profiles=${FM_VERIFY_CODEX_PROFILES:-account1}
claude_profiles=${FM_VERIFY_CLAUDE_PROFILES:-account1}

ok() {
  printf 'OK: %s\n' "$*"
}

fail() {
  failures=$((failures + 1))
  printf 'FAIL: %s\n' "$*" >&2
}

profile_dir() {
  local provider=$1
  local profile_label=$2
  local account_number

  case "$profile_label" in
    default)
      printf '%s/.%s\n' "$HOME" "$provider"
      ;;
    account[1-9]*)
      account_number=${profile_label#account}
      case "$account_number" in
        *[!0-9]*|'') return 1 ;;
      esac
      printf '%s/.%s-account%s\n' "$HOME" "$provider" "$account_number"
      ;;
    *)
      return 1
      ;;
  esac
}

check_pi_integration() {
  integration_output=$(herdr integration status 2>&1)
  integration_status=$?
  if [ "$integration_status" -eq 0 ] \
    && grep -Eq '^pi: current \(v[0-9]+\)' <<<"$integration_output"; then
    ok "Pi integration is current"
  else
    fail "Pi integration is not current"
  fi
}

check_codex_integration() {
  local profile_label=$1
  local profile_dir=$2

  integration_output=$(CODEX_HOME="$profile_dir" herdr integration status 2>&1)
  integration_status=$?
  if [ "$integration_status" -eq 0 ] \
    && grep -Eq '^codex: current \(v[0-9]+\)' <<<"$integration_output"; then
    ok "Codex $profile_label integration is current"
  else
    fail "Codex $profile_label integration is not current"
  fi
}

check_claude_integration() {
  local profile_label=$1
  local profile_dir=$2

  integration_output=$(CLAUDE_CONFIG_DIR="$profile_dir" herdr integration status 2>&1)
  integration_status=$?
  if [ "$integration_status" -eq 0 ] \
    && grep -Eq '^claude: current \(v[0-9]+\)' <<<"$integration_output"; then
    ok "Claude $profile_label integration is current"
  else
    fail "Claude $profile_label integration is not current"
  fi
}

if ! command -v herdr >/dev/null 2>&1; then
  fail "herdr is not on PATH"
  exit 1
fi

printf 'Herdr integration selection\n'
check_pi_integration

printf '\nSelected Codex profiles: %s\n' "$codex_profiles"
for profile_label in $codex_profiles; do
  if ! selected_profile_dir=$(profile_dir codex "$profile_label"); then
    fail "Codex profile label '$profile_label' is invalid; use default or accountN"
    continue
  fi
  check_codex_integration "$profile_label" "$selected_profile_dir"
done

printf '\nSelected Claude profiles: %s\n' "$claude_profiles"
for profile_label in $claude_profiles; do
  if ! selected_profile_dir=$(profile_dir claude "$profile_label"); then
    fail "Claude profile label '$profile_label' is invalid; use default or accountN"
    continue
  fi
  check_claude_integration "$profile_label" "$selected_profile_dir"
done

printf '\nSummary\n'
printf '%s failure(s)\n' "$failures"

if [ "$failures" -ne 0 ]; then
  exit 1
fi
