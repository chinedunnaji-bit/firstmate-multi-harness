#!/usr/bin/env bash
set -euo pipefail

export CLAUDE_CONFIG_DIR="$HOME/.claude-account1"
exec claude "$@"
