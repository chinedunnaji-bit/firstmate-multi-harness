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

if ! command -v node >/dev/null 2>&1; then
  fail "node is not on PATH"
else
  if node --test tests/account-fleet.test.mjs tests/project-fleet.test.mjs; then
    ok "Account and Computer Projects UI lifecycle, discovery, approval, and redaction tests pass"
  else
    fail "Account or Computer Projects UI tests failed"
  fi
fi

if grep -q 'id = "projects"' plugins/account-fleet/herdr-plugin.toml && \
  grep -q 'command = \["node", "project-fleet.mjs"\]' plugins/account-fleet/herdr-plugin.toml; then
  ok "Herdr plugin manifest declares the Computer Projects pane"
else
  fail "Herdr plugin manifest is missing the Computer Projects pane"
fi

if ! command -v herdr >/dev/null 2>&1; then
  fail "herdr is not on PATH"
elif ! command -v jq >/dev/null 2>&1; then
  fail "jq is not on PATH"
else
  plugin_json=$(herdr plugin list --json 2>/dev/null)
  plugin_status=$?
  if [ "$plugin_status" -eq 0 ] && printf '%s\n' "$plugin_json" | \
    jq -e '.result.plugins[]? | select(.plugin_id == "firstmate.account-fleet" and .enabled == true)' \
      >/dev/null 2>&1; then
    ok "FirstMate Account Fleet is linked and enabled in Herdr"
  else
    fail "FirstMate Account Fleet is not linked and enabled; run: herdr plugin link plugins/account-fleet --enabled"
  fi
fi

printf '\nSummary\n%s failure(s)\n' "$failures"
[ "$failures" -eq 0 ]
