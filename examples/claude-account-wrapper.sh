#!/usr/bin/env bash
set -euo pipefail

wrapper_name=${0##*/}
case "$wrapper_name" in
  claude[1-9]*) account_number=${wrapper_name#claude} ;;
  *)
    printf 'Install this wrapper under a numbered name such as claude3.\n' >&2
    exit 2
    ;;
esac

case "$account_number" in
  *[!0-9]*|'')
    printf 'Invalid Claude account wrapper name: %s\n' "$wrapper_name" >&2
    exit 2
    ;;
esac

export CLAUDE_CONFIG_DIR="$HOME/.claude-account$account_number"
exec claude "$@"
