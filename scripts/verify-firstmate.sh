#!/usr/bin/env bash

set -uo pipefail

failures=0
firstmate_repo=${FIRSTMATE_REPO:-"$HOME/src/firstmate"}
audited_revision=6c1d2db194cb20e08232ba2fa2c414592f724b44

ok() {
  printf 'OK: %s\n' "$*"
}

fail() {
  failures=$((failures + 1))
  printf 'FAIL: %s\n' "$*" >&2
}

if [ ! -d "$firstmate_repo/.git" ]; then
  fail "FirstMate Git clone not found at $firstmate_repo (override with FIRSTMATE_REPO)"
  exit 1
fi

if [ -f "$firstmate_repo/AGENTS.md" ] && [ -x "$firstmate_repo/bin/fm-bootstrap.sh" ]; then
  ok "FirstMate instruction and bootstrap surfaces exist"
else
  fail "FirstMate clone is missing AGENTS.md or executable fm-bootstrap.sh"
fi

actual_revision=$(git -C "$firstmate_repo" rev-parse HEAD 2>/dev/null || true)
if [ "$actual_revision" = "$audited_revision" ]; then
  ok "FirstMate is pinned to the audited revision $audited_revision"
else
  fail "FirstMate revision differs from the audited commit; re-audit before claiming this guide applies"
fi

if bash -n "$firstmate_repo/bin/fm-spawn.sh"; then
  ok "fm-spawn.sh passes Bash syntax validation"
else
  fail "fm-spawn.sh has invalid Bash syntax"
fi

if grep -Fq 'if [ "$HARNESS" = codex ] && [ -n "${CODEX_HOME:-}" ]; then' \
  "$firstmate_repo/bin/fm-spawn.sh" \
  && grep -Fq 'LAUNCH="CODEX_HOME=$(shell_quote "$CODEX_HOME") $LAUNCH"' \
    "$firstmate_repo/bin/fm-spawn.sh"; then
  ok "Codex worker launches explicitly forward CODEX_HOME"
else
  fail "Codex worker CODEX_HOME forwarding is absent; apply or re-evaluate the tested patch"
fi

if [ -f "$firstmate_repo/config/backend" ] \
  && [ "$(tr -d '[:space:]' < "$firstmate_repo/config/backend")" = herdr ]; then
  ok "FirstMate backend is explicitly herdr"
else
  fail "config/backend is missing or does not contain herdr"
fi

if [ -e "$firstmate_repo/config/crew-harness" ]; then
  fail "config/crew-harness exists; remove it to preserve dynamic profile routing"
else
  ok "config/crew-harness is absent"
fi

dispatch_file="$firstmate_repo/config/crew-dispatch.json"
if [ ! -f "$dispatch_file" ]; then
  fail "config/crew-dispatch.json is missing"
elif ! jq -e . "$dispatch_file" >/dev/null 2>&1; then
  fail "config/crew-dispatch.json is malformed JSON"
elif jq -e '
  ([.rules[].use] + [.default])
  | map(if type == "array" then .[] else . end)
  | all(.harness == "pi" or .harness == "codex" or .harness == "claude")
' "$dispatch_file" >/dev/null 2>&1; then
  ok "dispatch JSON uses only the intended Pi/Codex/Claude harnesses"
else
  fail "dispatch JSON contains a profile outside Pi/Codex/Claude"
fi

if git -C "$firstmate_repo" diff --check; then
  ok "FirstMate local diff passes Git whitespace/error checks"
else
  fail "FirstMate local diff has a Git whitespace/error problem"
fi

bootstrap_output=$(cd "$firstmate_repo" && \
  FM_BOOTSTRAP_DETECT_ONLY=1 \
  FM_BOOTSTRAP_NETWORK=skip \
  bin/fm-bootstrap.sh 2>&1)
bootstrap_status=$?
if [ "$bootstrap_status" -eq 0 ] \
  && ! printf '%s\n' "$bootstrap_output" | grep -Eq 'CREW_DISPATCH:|MISSING:'; then
  ok "FirstMate detect-only bootstrap accepts the local toolchain and dispatch profile"
else
  fail "FirstMate detect-only bootstrap rejected the toolchain or dispatch profile; rerun it directly for diagnostics"
fi

printf '\nSummary\n'
printf '%s failure(s)\n' "$failures"

if [ "$failures" -ne 0 ]; then
  exit 1
fi
