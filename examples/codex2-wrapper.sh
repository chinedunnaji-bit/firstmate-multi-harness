#!/usr/bin/env bash
set -euo pipefail

export CODEX_HOME="$HOME/.codex-account2"
exec codex "$@"
