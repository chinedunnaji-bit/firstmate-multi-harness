#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
setup_root=$(cd "$script_dir/.." && pwd)
firstmate_home=${FM_FIRSTMATE_HOME:-$HOME/src/firstmate}
registry_path=${FM_ACCOUNT_FLEET_CONFIG:-}
account_router=${FM_ACCOUNT_ROUTER:-$setup_root/scripts/account-router.mjs}

if [ -z "$registry_path" ] && command -v herdr >/dev/null 2>&1; then
  plugin_config_dir=$(herdr plugin config-dir firstmate.account-fleet 2>/dev/null || true)
  if [ -n "$plugin_config_dir" ]; then
    registry_path=$plugin_config_dir/accounts.json
  fi
fi

if [ -z "$registry_path" ]; then
  registry_path=$HOME/.config/firstmate-multi-harness/accounts.json
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

profile_directory() {
  local provider=$1 label=$2 number
  case "$label" in
    default)
      printf '%s\n' "$HOME/.$provider"
      ;;
    account[1-9]*)
      number=${label#account}
      case "$number" in
        *[!0-9]*|'') return 1 ;;
      esac
      printf '%s\n' "$HOME/.$provider-account$number"
      ;;
    *) return 1 ;;
  esac
}

if ! codex_home=$(profile_directory codex "$codex_primary"); then
  echo "launch-firstmate: invalid Codex primary '$codex_primary'" >&2
  exit 1
fi
if ! claude_config_dir=$(profile_directory claude "$claude_primary"); then
  echo "launch-firstmate: invalid Claude primary '$claude_primary'" >&2
  exit 1
fi

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
if [ ! -x "$account_router" ]; then
  echo "launch-firstmate: account router is missing or not executable: $account_router" >&2
  exit 1
fi

export CODEX_HOME="$codex_home"
export CLAUDE_CONFIG_DIR="$claude_config_dir"
export FM_ACCOUNT_FLEET_CONFIG="$registry_path"
export FM_ACCOUNT_ROUTER="$account_router"
export FM_ACCOUNT_ROUTER_STATE=${FM_ACCOUNT_ROUTER_STATE:-$HOME/.local/state/firstmate-account-router/state.json}
cd "$firstmate_home"
exec pi "$@"
