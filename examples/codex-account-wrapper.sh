#!/usr/bin/env bash
set -euo pipefail

wrapper_name=${0##*/}
case "$wrapper_name" in
  codex[1-9]*) account_number=${wrapper_name#codex} ;;
  *)
    printf 'Install this wrapper under a numbered name such as codex3.\n' >&2
    exit 2
    ;;
esac

case "$account_number" in
  *[!0-9]*|'')
    printf 'Invalid Codex account wrapper name: %s\n' "$wrapper_name" >&2
    exit 2
    ;;
esac

export CODEX_HOME="$HOME/.codex-account$account_number"
exec codex "$@"
