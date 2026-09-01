# Multi-account routing

Harness routing and account routing are separate. FirstMate selects `codex` or
`claude`; an account layer selects which existing vendor configuration directory
that harness uses.

## Profile convention

This setup uses:

```text
Codex default   $HOME/.codex
Codex primary   $HOME/.codex-account1
Codex fallback  $HOME/.codex-account2

Claude default  $HOME/.claude
Claude primary  $HOME/.claude-account1
Claude fallback $HOME/.claude-account2
```

`codex1` and `claude1` are the preferred identities.

These directories stay outside every Git repository. Do not copy a profile to
create another identity; launch the corresponding CLI under an empty/new
directory and complete its own login flow.

Claude Code officially documents `CLAUDE_CONFIG_DIR` as overriding its entire
configuration directory and explicitly describes it as useful for running
multiple accounts side by side.

Source: [Claude Code environment variables](https://code.claude.com/docs/en/env-vars).

The installed Codex CLI and Herdr's current Codex integration both honor
`CODEX_HOME`. Herdr requires the selected directory to exist before integration
installation.

Source: [Herdr Codex integration](https://herdr.dev/docs/integrations/#codex).

## Executable wrappers

Interactive Zsh aliases and functions are not reliable automation interfaces:
noninteractive Bash, Herdr panes, and child processes may not load them. Install
real executables from this repository:

```sh
install -d "$HOME/.local/bin"
install -m 0755 examples/codex1-wrapper.sh "$HOME/.local/bin/codex1"
install -m 0755 examples/codex2-wrapper.sh "$HOME/.local/bin/codex2"
install -m 0755 examples/claude1-wrapper.sh "$HOME/.local/bin/claude1"
install -m 0755 examples/claude2-wrapper.sh "$HOME/.local/bin/claude2"
```

Each wrapper follows this pattern:

```sh
#!/usr/bin/env bash
set -euo pipefail

export CODEX_HOME="$HOME/.codex-account1"
exec codex "$@"
```

The Claude wrappers set `CLAUDE_CONFIG_DIR` instead. `exec` preserves signal and
exit behavior; `"$@"` preserves the exact argument vector. The examples contain
no credential material and no machine-specific username.

Verified from a fresh Node 22 login shell:

```sh
codex1 --version
codex2 --version
claude1 --version
claude2 --version
```

The same wrappers invoked from a stale Node 20 shell selected the older global
Codex and Claude installations. This is expected NVM behavior and is why the
guide requires a fresh shell after changing the default.

## Authentication

Authenticate every profile independently:

```sh
CODEX_HOME="$HOME/.codex" codex login
codex1 login
codex2 login

CLAUDE_CONFIG_DIR="$HOME/.claude" claude auth login
claude1 auth login
claude2 auth login
```

Never commit or print the resulting files. On macOS, Claude may store the secret
itself in Keychain while retaining profile-specific configuration on disk.

Verify only status:

```sh
CODEX_HOME="$HOME/.codex" codex login status >/dev/null
codex1 login status >/dev/null
codex2 login status >/dev/null

CLAUDE_CONFIG_DIR="$HOME/.claude-account1" claude auth status --json \
  | jq -e '.loggedIn == true' >/dev/null
```

## Herdr integration per account

Herdr's hook is installed into a specific configuration directory, so repeat the
integration installation for every profile. A current hook in one account does
not prove another account is integrated.

```sh
CODEX_HOME="$HOME/.codex-account1" herdr integration install codex
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" herdr integration install claude
```

Run the equivalent command for default and account2, then verify:

```sh
./scripts/verify-herdr-integrations.sh
```

All six profile hooks plus Pi reported Herdr integration revision v8 in the
audit.

## Preferred account at the FirstMate boundary

Launch the Pi coordinator with primary profile variables:

```sh
cd "$HOME/src/firstmate"
CODEX_HOME="$HOME/.codex-account1" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  pi
```

Audited FirstMate already forwards `CLAUDE_CONFIG_DIR` into a Claude worker's
daemon-created pane. It did not forward `CODEX_HOME`, so this repository carries
a tested minimal patch that adds the symmetric prefix to Codex worker launches.
Without that patch, setting `CODEX_HOME` only on the coordinator does not prove
that a worker created by the long-lived Herdr daemon uses the same account.

This establishes deterministic primary-account routing:

```text
FirstMate -> codex harness -> $HOME/.codex-account1
FirstMate -> claude harness -> $HOME/.claude-account1
```

It does not yet implement automatic fallback.

## Actual quota isolation test

`quota-axi` was run with strict read-only flags under each directory:

```sh
CODEX_HOME="$HOME/.codex-account1" \
  quota-axi --provider codex --json --no-credential-refresh

CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  quota-axi --provider claude --json --no-credential-refresh
```

Sanitized result matrix:

| Provider profile | Vendor auth check | Strict quota state |
| --- | --- | --- |
| Codex default | reported a stored login | stale/unavailable |
| Codex account1 | authenticated | fresh |
| Codex account2 | reported a stored login | stale/unavailable |
| Claude default | not authenticated | unavailable |
| Claude account1 | authenticated | fresh |
| Claude account2 | not authenticated | unavailable |

No identity, quota amount, token, or credential content was recorded.

This proves that `quota-axi` reads the selected profile separately. It also
proves that a vendor `login status` success is not always sufficient capacity
evidence: the two stale Codex profiles require reauthentication before they can
participate in fallback.

`quota-axi` documents Codex discovery through `$CODEX_HOME/auth.json` and Claude
discovery through `$CLAUDE_CONFIG_DIR/.credentials.json` or a corresponding
profile/account-scoped macOS Keychain entry. The tool reads those stores; this
repository never does.

Source: [quota-axi credential sources](https://github.com/kunchenguid/quota-axi#credential-sources).

## Why account names do not belong in dispatch JSON

This is invalid:

```json
{"harness":"codex1"}
```

FirstMate rejected the real test with:

```text
CREW_DISPATCH: invalid config/crew-dispatch.json - unverified harness: codex1
```

Keep the recognized harness constant and route the account below it.

## Automatic quota-aware account fallback: current boundary

Automatic account fallback is not declared working. Two conditions remain:

1. at least two accounts per provider must return usable current quota evidence;
2. a router beneath the recognized `codex`/`claude` executable boundary must be
   implemented and tested with real FirstMate workers.

The safe router contract is:

1. keep account1 first as the preferred candidate;
2. run one strict, profile-scoped `quota-axi` query per candidate;
3. treat stale, missing, and unknown evidence as uncertainty, not as invented
   capacity;
4. reject a candidate only on a definitive auth/capacity failure;
5. use the published all-model `selection.spendPriority` only when it is known
   and comparable;
6. incorporate task completion/runway requirements before switching;
7. stop on an unresolved genuine tie or all-uncertain state;
8. export only the chosen config directory and `exec` the real harness with
   `"$@"`;
9. never refresh credentials, print identity, or rewrite a profile during
   selection.

This mirrors FirstMate's conservative quota-array reasoning instead of treating
a raw remaining percentage as a complete routing decision.

Once secondary accounts are authenticated, implement the router behind
`codex`/`claude`, not as new FirstMate harness identifiers, and preserve the
primary wrappers for explicit manual selection.
