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

sanitize_path() {
  case "$1" in
    "$HOME"/*) printf '$HOME/%s\n' "${1#"$HOME"/}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

tool_version() {
  case "$1" in
    git) git --version ;;
    gh) gh --version | sed -n '1p' ;;
    jq) jq --version ;;
    node) node --version ;;
    npm) npm --version ;;
    pi) pi --version 2>&1 ;;
    herdr) herdr --version ;;
    treehouse) treehouse --version ;;
    codex) codex --version 2>/dev/null ;;
    claude) claude --version ;;
    quota-axi|tasks-axi|gh-axi|chrome-devtools-axi|lavish-axi)
      "$1" --version
      ;;
    no-mistakes) no-mistakes --version ;;
    brew) brew --version | sed -n '1p' ;;
    *) return 1 ;;
  esac
}

check_tool() {
  tool_name=$1
  tool_path=$(command -v "$tool_name" 2>/dev/null || true)
  if [ -z "$tool_path" ]; then
    fail "$tool_name is not on PATH"
    return
  fi

  version_output=$(tool_version "$tool_name" 2>&1)
  version_status=$?
  if [ "$version_status" -ne 0 ]; then
    fail "$tool_name exists at $(sanitize_path "$tool_path") but its version command failed"
    return
  fi

  version_line=$(printf '%s\n' "$version_output" | sed -n '1p')
  ok "$tool_name: $version_line ($(sanitize_path "$tool_path"))"
}

check_exact_version() {
  tool_name=$1
  expected_version_line=$2

  if ! command -v "$tool_name" >/dev/null 2>&1; then
    return
  fi

  actual_version_line=$(tool_version "$tool_name" 2>&1 | sed -n '1p')
  if [ "$actual_version_line" = "$expected_version_line" ]; then
    ok "$tool_name matches the audited version: $expected_version_line"
  else
    fail "$tool_name version is '$actual_version_line'; this guide audited '$expected_version_line'"
  fi
}

printf 'Platform\n'
if [ "$(uname -s)" = Darwin ]; then
  ok "macOS $(sw_vers -productVersion) on $(uname -m)"
else
  fail "this guide is verified on macOS; detected $(uname -s)"
fi

if [ "$(uname -m)" != arm64 ]; then
  warn "the audited machine is Apple Silicon (arm64); this machine is $(uname -m)"
fi

if xcode-select -p >/dev/null 2>&1; then
  ok "Apple developer tools: $(xcode-select -p)"
else
  fail "Apple Command Line Tools/Xcode are not selected"
fi

printf '\nRequired commands\n'
for required_tool in \
  git gh jq node npm pi herdr treehouse codex claude \
  quota-axi tasks-axi gh-axi chrome-devtools-axi lavish-axi no-mistakes
do
  check_tool "$required_tool"
done

if command -v brew >/dev/null 2>&1; then
  check_tool brew
else
  warn "Homebrew is not on PATH; it is used by the documented macOS installation path"
fi

if command -v node >/dev/null 2>&1; then
  if node -e '
    const got = process.versions.node.split(".").map(Number);
    const min = [22, 19, 0];
    for (let i = 0; i < 3; i += 1) {
      if (got[i] > min[i]) process.exit(0);
      if (got[i] < min[i]) process.exit(1);
    }
  '; then
    ok "Node satisfies the audited >=22.19.0 floor"
  else
    fail "Node 22.19.0 or newer is required by the audited Pi/quota-axi releases"
  fi
fi

printf '\nPinned npm toolset\n'
check_exact_version node 'v22.21.1'
check_exact_version npm '10.9.4'
check_exact_version pi '0.84.4'
check_exact_version codex 'codex-cli 0.151.0'
check_exact_version claude '2.1.252 (Claude Code)'
check_exact_version quota-axi '0.1.34'
check_exact_version tasks-axi '0.2.5'
check_exact_version gh-axi '0.1.35'
check_exact_version chrome-devtools-axi '0.1.33'
check_exact_version lavish-axi '0.1.63'

printf '\nRequired feature probes\n'
treehouse_help=''
treehouse_help_status=1
if command -v treehouse >/dev/null 2>&1; then
  treehouse_help=$(treehouse get --help 2>&1)
  treehouse_help_status=$?
fi
if [ "$treehouse_help_status" -eq 0 ] \
  && grep -q -- '--lease' <<<"$treehouse_help"; then
  ok "Treehouse advertises durable get --lease support"
else
  fail "Treehouse does not advertise the required get --lease feature"
fi

if command -v no-mistakes >/dev/null 2>&1 \
  && no-mistakes axi --help >/dev/null 2>&1; then
  ok "No Mistakes advertises its AXI integration surface"
else
  fail "No Mistakes AXI integration surface is unavailable"
fi

if [ -n "${NVM_BIN:-}" ]; then
  ok "NVM-selected bin directory: $(sanitize_path "$NVM_BIN")"
else
  warn "NVM_BIN is unset; run this check from a fresh terminal after loading NVM"
fi

if gh auth status >/dev/null 2>&1; then
  ok "GitHub CLI authentication is usable"
else
  fail "GitHub CLI authentication is not usable; run gh auth login"
fi

printf '\nSummary\n'
printf '%s failure(s), %s warning(s)\n' "$failures" "$warnings"

if [ "$failures" -ne 0 ]; then
  exit 1
fi
