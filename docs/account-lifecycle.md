# Account lifecycle

Only one usable account per worker provider is required. The clean default is:

```text
Codex primary: codex1  -> $HOME/.codex-account1
Claude primary: claude1 -> $HOME/.claude-account1
```

The default stores, account2, account3, and later profiles are optional. Do not
create, authenticate, integrate, or verify an account merely to fill a numbered
slot.

Account numbers are local labels. They do not need to match between providers:
you can enable Codex account2 while continuing to use only Claude account1.

The supported visual workflow is [Account Fleet UI](account-ui.md). It manages
planned/active/retired routing metadata and primary selection. This page remains
the authoritative procedure for vendor login/logout, Herdr hook installation,
wrapper permissions, archival, and eventual deletion.

## Verify the primary-only setup

The verification scripts select `account1` for both providers by default:

```sh
./scripts/verify-all.sh
```

The equivalent explicit form is:

```sh
FM_VERIFY_CODEX_PROFILES=account1 \
FM_VERIFY_CLAUDE_PROFILES=account1 \
  ./scripts/verify-all.sh
```

On the audited machine, primary-only verification proved:

```text
Codex account1 auth/quota: pass
Claude account1 auth/quota: pass
selected Herdr integrations: pass
Pi coordinator model: pending interactive /login
```

An absent optional account is not a failure because it is not selected.

## Add account2 later

Run these commands from the setup repository in a fresh Node 22 shell.

Install a wrapper only if the target does not already exist:

```sh
test ! -e "$HOME/.local/bin/codex2"
install -m 0755 examples/codex2-wrapper.sh "$HOME/.local/bin/codex2"

test ! -e "$HOME/.local/bin/claude2"
install -m 0755 examples/claude2-wrapper.sh "$HOME/.local/bin/claude2"
```

If either `test` fails, inspect the existing executable instead of overwriting
it.

Authenticate each new profile independently:

```sh
codex2 login
claude2 auth login
```

Do not copy `auth.json`, Claude credential files, or Keychain entries from
account1.

Install the profile-local Herdr hooks:

```sh
CODEX_HOME="$HOME/.codex-account2" herdr integration install codex
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" herdr integration install claude
```

Install or repair the support hooks for the new pair:

```sh
CODEX_HOME="$HOME/.codex-account2" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" \
  gh-axi setup hooks
CODEX_HOME="$HOME/.codex-account2" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" \
  chrome-devtools-axi setup hooks
CODEX_HOME="$HOME/.codex-account2" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" \
  lavish-axi setup hooks
```

Permit Claude's profile-scoped Keychain read once in a normal interactive
terminal:

```sh
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" \
  quota-axi --provider claude --json --allow-keychain-prompt \
  --no-credential-refresh >/dev/null
```

Verify both active accounts:

```sh
FM_VERIFY_CODEX_PROFILES="account1 account2" \
FM_VERIFY_CLAUDE_PROFILES="account1 account2" \
  ./scripts/verify-all.sh
```

This expands verification; it does not enable automatic fallback.

## Add only one provider account

Provider lists are independent. If you add Codex account2 but have no Claude
account2, pair the support-hook setup with the existing Claude primary:

```sh
CODEX_HOME="$HOME/.codex-account2" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  gh-axi setup hooks
CODEX_HOME="$HOME/.codex-account2" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  chrome-devtools-axi setup hooks
CODEX_HOME="$HOME/.codex-account2" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  lavish-axi setup hooks

FM_VERIFY_CODEX_PROFILES="account1 account2" \
FM_VERIFY_CLAUDE_PROFILES=account1 \
  ./scripts/verify-all.sh
```

If you add only Claude account2, reverse the pairing:

```sh
CODEX_HOME="$HOME/.codex-account1" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" \
  gh-axi setup hooks
CODEX_HOME="$HOME/.codex-account1" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" \
  chrome-devtools-axi setup hooks
CODEX_HOME="$HOME/.codex-account1" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" \
  lavish-axi setup hooks

FM_VERIFY_CODEX_PROFILES=account1 \
FM_VERIFY_CLAUDE_PROFILES="account1 account2" \
  ./scripts/verify-all.sh
```

The hook setup commands are install-or-repair operations. Pairing a new store
with the existing primary may repair the primary hook but does not copy its
credentials.

## Add account3 or a later number

The generic wrappers derive the profile number from the installed executable
name. For account3:

```sh
test ! -e "$HOME/.local/bin/codex3"
install -m 0755 examples/codex-account-wrapper.sh \
  "$HOME/.local/bin/codex3"

test ! -e "$HOME/.local/bin/claude3"
install -m 0755 examples/claude-account-wrapper.sh \
  "$HOME/.local/bin/claude3"
```

The resulting mapping is:

```text
codex3  -> CODEX_HOME=$HOME/.codex-account3
claude3 -> CLAUDE_CONFIG_DIR=$HOME/.claude-account3
```

The generic wrappers were tested under the names `codex3` and `claude4`. They
selected the matching profile and preserved a three-argument vector containing
spaces and a literal wildcard. They refuse a non-numbered install name.

Continue with login, Herdr integration, support hooks, and verification using
the same number:

```sh
codex3 login
claude3 auth login

CODEX_HOME="$HOME/.codex-account3" herdr integration install codex
CLAUDE_CONFIG_DIR="$HOME/.claude-account3" herdr integration install claude

CODEX_HOME="$HOME/.codex-account3" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account3" \
  gh-axi setup hooks
CODEX_HOME="$HOME/.codex-account3" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account3" \
  chrome-devtools-axi setup hooks
CODEX_HOME="$HOME/.codex-account3" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account3" \
  lavish-axi setup hooks

FM_VERIFY_CODEX_PROFILES="account1 account3" \
FM_VERIFY_CLAUDE_PROFILES="account1 account3" \
  ./scripts/verify-all.sh
```

The verifier accepts `default` and any positive `accountN` label. It never
discovers profiles automatically; only the lists you supply are checked.

## Retire an account safely

Retiring a local profile does not close the vendor account or cancel a
subscription. It removes that profile from this stack and clears its local CLI
authentication.

First finish or reconcile every worker using the profile. Remove it from any
custom account router and from `FM_VERIFY_*_PROFILES` commands. The repository's
default FirstMate launch uses account1 only, so unused account2 profiles require
no dispatch-file change.

For Codex account2:

```sh
CODEX_HOME="$HOME/.codex-account2" codex logout
CODEX_HOME="$HOME/.codex-account2" herdr integration uninstall codex
chmod 0644 "$HOME/.local/bin/codex2"
```

For Claude account2:

```sh
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" claude auth logout
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" \
  herdr integration uninstall claude
chmod 0644 "$HOME/.local/bin/claude2"
```

The final `chmod` is optional and reversible. It prevents accidental wrapper
launches while retaining the reviewed wrapper file.

Verify retirement without displaying account details:

```sh
if CODEX_HOME="$HOME/.codex-account2" \
  codex login status >/dev/null 2>&1
then
  echo 'Codex account2 is still logged in'
else
  echo 'Codex account2 is logged out'
fi

CLAUDE_CONFIG_DIR="$HOME/.claude-account2" claude auth status --json \
  | jq -e '.loggedIn == false' >/dev/null

test ! -x "$HOME/.local/bin/codex2"
test ! -x "$HOME/.local/bin/claude2"
```

Official OpenAI documentation states that `codex logout` clears the current
stored credentials and that file-based credentials are stored under
`CODEX_HOME`. Installed Claude help identifies `claude auth logout` as the
account logout command.

Sources: [OpenAI Codex authentication](https://developers.openai.com/codex/auth#check-authentication-or-sign-out),
[Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage),
[Herdr integrations](https://herdr.dev/docs/integrations/).

## Archive profile configuration recoverably

Vendor logout is normally enough. If you also want the remaining profile
configuration and hooks out of the active path, move the directory after logout
and integration uninstall. Use a destination that does not already exist:

```sh
profile_dir="$HOME/.codex-account2"
archive_dir="$HOME/.codex-account2.retired"
test -d "$profile_dir"
test ! -e "$archive_dir"
mv "$profile_dir" "$archive_dir"
```

For Claude, use `.claude-account2` and `.claude-account2.retired`. Claude may
use macOS Keychain, so moving the directory is not a substitute for
`claude auth logout`.

Do not use recursive deletion as the first cleanup step. After operating
without the profile and inspecting the archive, move it to Trash using Finder
if permanent local deletion is really desired.

## Reactivate a retired account

If the profile was only logged out and the wrapper disabled:

```sh
chmod 0755 "$HOME/.local/bin/codex2"
codex2 login
CODEX_HOME="$HOME/.codex-account2" herdr integration install codex
```

For Claude:

```sh
chmod 0755 "$HOME/.local/bin/claude2"
claude2 auth login
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" herdr integration install claude
```

If the directory was archived, first move it back after confirming the active
path does not exist. Repeat support-hook setup, the Claude Keychain quota check,
and the selected-profile verifier before routing work to it.

## Change the primary account

The primary is chosen at coordinator launch, not in `crew-dispatch.json`. To
promote account2 for both providers:

```sh
cd "$HOME/src/firstmate"
CODEX_HOME="$HOME/.codex-account2" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" \
  pi
```

Verify both promoted profiles first. Do not retire account1 while live workers
still use it. If one provider has no replacement account, remove or revise the
dynamic dispatch rule that selects that provider before retiring its only
usable profile.
