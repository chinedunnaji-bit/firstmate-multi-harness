#!/usr/bin/env bash

set -euo pipefail

firstmate_home=${FM_FIRSTMATE_HOME:-$HOME/src/firstmate}
registry_path=${FM_ACCOUNT_FLEET_CONFIG:-}

if [ -z "$registry_path" ] && command -v herdr >/dev/null 2>&1; then
  plugin_config_dir=$(herdr plugin config-dir firstmate.account-fleet 2>/dev/null || true)
  if [ -n "$plugin_config_dir" ]; then
    registry_path=$plugin_config_dir/accounts.json
  fi
fi

codex_primary=account1
claude_primary=account1

if [ -n "$registry_path" ] && [ -f "$registry_path" ]; then
  command -v jq >/dev/null 2>&1 || {
    echo "launch-firstmate: jq is required to read Account Fleet state" >&2
    exit 1
  }
  if ! jq -e '
      .schema == "firstmate.account-fleet.v1" and
      (.providers.codex.primary | type == "string") and
      (.providers.claude.primary | type == "string") and
      (.providers.codex as $provider |
        any($provider.profiles[]?;
          .label == $provider.primary and .state == "active")) and
      (.providers.claude as $provider |
        any($provider.profiles[]?;
          .label == $provider.primary and .state == "active"))
    ' "$registry_path" >/dev/null; then
    echo "launch-firstmate: invalid Account Fleet registry: $registry_path" >&2
    exit 1
  fi
  codex_primary=$(jq -er '.providers.codex.primary' "$registry_path")
  claude_primary=$(jq -er '.providers.claude.primary' "$registry_path")
fi

profile_number() {
  local number
  case "$1" in
    account[1-9]*)
      number=${1#account}
      case "$number" in
        *[!0-9]*|'') return 1 ;;
      esac
      printf '%s\n' "$number"
      ;;
    *) return 1 ;;
  esac
}

if ! codex_number=$(profile_number "$codex_primary"); then
  echo "launch-firstmate: invalid Codex primary '$codex_primary'" >&2
  exit 1
fi
if ! claude_number=$(profile_number "$claude_primary"); then
  echo "launch-firstmate: invalid Claude primary '$claude_primary'" >&2
  exit 1
fi

codex_home=$HOME/.codex-account$codex_number
claude_config_dir=$HOME/.claude-account$claude_number

if [ ! -d "$codex_home" ]; then
  echo "launch-firstmate: Codex primary directory is missing: $codex_home" >&2
  exit 1
fi
if [ ! -d "$claude_config_dir" ]; then
  echo "launch-firstmate: Claude primary directory is missing: $claude_config_dir" >&2
  exit 1
fi
if [ ! -d "$firstmate_home" ]; then
  echo "launch-firstmate: FirstMate directory is missing: $firstmate_home" >&2
  exit 1
fi
command -v pi >/dev/null 2>&1 || {
  echo "launch-firstmate: pi is not on PATH" >&2
  exit 1
}

export CODEX_HOME="$codex_home"
export CLAUDE_CONFIG_DIR="$claude_config_dir"
cd "$firstmate_home"
exec pi "$@"
