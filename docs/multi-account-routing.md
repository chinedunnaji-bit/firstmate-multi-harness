# Multi-account routing

Harness routing and account routing are separate. FirstMate selects `codex` or
`claude`; an account layer selects which existing vendor configuration directory
that harness uses.

## Profile convention

This setup uses:

```text
Codex optional default  $HOME/.codex
Codex primary           $HOME/.codex-account1
Codex optional account2 $HOME/.codex-account2

Claude optional default  $HOME/.claude
Claude primary           $HOME/.claude-account1
Claude optional account2 $HOME/.claude-account2
```

`codex1` and `claude1` are the preferred identities and the only required
worker profiles. Provider profile counts are independent.

These directories stay outside every Git repository. Do not copy a profile to
create another identity; launch the corresponding CLI under an empty/new
directory and complete its own login flow.

Claude Code officially documents `CLAUDE_CONFIG_DIR` as overriding its entire
configuration directory and explicitly describes it as useful for running
multiple accounts side by side.

Source: [Claude Code environment variables](https://code.claude.com/docs/en/env-vars).

Official OpenAI documentation identifies `CODEX_HOME` as the root for
file-backed Codex credentials, and Herdr's current Codex integration honors the
same selector. Herdr requires the selected directory to exist before integration
installation.

Sources: [OpenAI Codex authentication](https://learn.chatgpt.com/docs/auth),
[Herdr Codex integration](https://herdr.dev/docs/integrations/#codex).

## Executable wrappers

Interactive Zsh aliases and functions are not reliable automation interfaces:
noninteractive Bash, Herdr panes, and child processes may not load them. Install
real executables from this repository:

```sh
install -d "$HOME/.local/bin"
install -m 0755 examples/codex1-wrapper.sh "$HOME/.local/bin/codex1"
install -m 0755 examples/claude1-wrapper.sh "$HOME/.local/bin/claude1"
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
claude1 --version
```

The same wrappers invoked from a stale Node 20 shell selected the older global
Codex and Claude installations. This is expected NVM behavior and is why the
guide requires a fresh shell after changing the default.

Fixed account2 examples and basename-driven generic wrappers are available for
later accounts. Their tested installation and lifecycle are documented in
[account lifecycle](account-lifecycle.md).

## Authentication

Authenticate only profiles you actually own. The minimum is:

```sh
codex1 login

claude1 auth login
```

Never commit or print the resulting files. On macOS, Claude may store the secret
itself in Keychain while retaining profile-specific configuration on disk.

Verify only status:

```sh
codex1 login status >/dev/null

CLAUDE_CONFIG_DIR="$HOME/.claude-account1" claude auth status --json \
  | jq -e '.loggedIn == true' >/dev/null
```

## Herdr integration per account

Herdr's hook is installed into a specific configuration directory, so install
it for every active profile. A current hook in one account does not prove
another account is integrated.

```sh
CODEX_HOME="$HOME/.codex-account1" herdr integration install codex
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" herdr integration install claude
```

Verify the selected account1 profiles:

```sh
./scripts/verify-herdr-integrations.sh
```

The audit installed and checked all six possible profile hooks plus Pi, but the
clean verifier selects only the two account1 hooks. Optional hooks do not need
to exist until their accounts are enabled.

## Preferred account at the FirstMate boundary

Launch the Pi coordinator through the repository launcher:

```sh
cd "$HOME/src/firstmate-multi-harness"
./scripts/launch-firstmate.sh
```

The launcher exports the registry and account-router paths as well as both
primary directories. Audited FirstMate already forwarded `CLAUDE_CONFIG_DIR`
into a Claude worker's daemon-created pane. It did not forward `CODEX_HOME` or
select among provider profiles, so this repository carries the tested
`patches/firstmate-account-routing.patch` integration.

The boundary is now:

```text
FirstMate dispatch -> codex harness  -> account router -> CODEX_HOME
FirstMate dispatch -> claude harness -> account router -> CLAUDE_CONFIG_DIR
```

The patch validates that the router returns the same provider and harness that
FirstMate already chose. It records only `account_profile=accountN` in task
metadata. A malformed or cross-provider result refuses before task metadata or
a worker endpoint is published.

## Actual quota isolation test

`quota-axi` was run with strict read-only flags under each directory:

```sh
CODEX_HOME="$HOME/.codex-account1" \
  quota-axi --provider codex --json --no-credential-refresh

CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  quota-axi --provider claude --json --no-credential-refresh
```

Sanitized historical result matrix from the earlier profile-isolation audit:

| Provider profile | Vendor auth check | Strict quota state |
| --- | --- | --- |
| Codex default | reported a stored login | stale/unavailable |
| Codex account1 | authenticated | fresh |
| Codex account2 directory | reported a stored login | stale/unavailable |
| Claude default | not authenticated | unavailable |
| Claude account1 | authenticated | fresh |
| Claude account2 directory | not authenticated | unavailable |

No identity, quota amount, token, or credential content was recorded.

The presence of a directory or old stored-login signal does not prove that the
operator owns a usable second subscription. These optional rows remain outside
active routing until their own login and readiness verification succeed.

This proves that `quota-axi` reads the selected profile separately. It also
proves that a vendor `login status` success is not always sufficient capacity
evidence. A stale profile would require reauthentication before participating
in fallback; an account the user does not own should simply remain unselected.

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

## Automatic same-provider account selection

`scripts/account-router.mjs` is implemented and fixture-tested. On every Codex
or Claude worker spawn or controlled relaunch it:

1. reads only active profiles for the already-selected provider;
2. asks `quota-axi --json --no-credential-refresh` separately under each
   profile directory;
3. requires schema version 5, a fresh non-stale provider report, known
   all-model availability, and measurable runway;
4. keeps an existing healthy task lease so a long task does not oscillate;
5. otherwise prefers the configured primary;
6. if the primary is exhausted or below an explicit captain floor, ranks usable
   same-provider alternates by known `selection.spendPriority`;
7. treats projected exhaustion as advisory while remaining quota is above the
   captain's floor, and refuses stale, unknown, unrankable, tied, or
   all-exhausted choices;
8. returns only the selector name, profile label, directory, reason, and
   sanitized capacity evidence.

The default captain floor is `0%`. This means a profile remains eligible while
it has quota, even when its current cycle-average pace projects exhaustion
before reset. Provider-reported exhaustion triggers rotation; set a non-zero
floor only as an explicit earlier-switch policy:

```sh
node plugins/account-fleet/account-fleet.mjs --threshold codex 15
node plugins/account-fleet/account-fleet.mjs --threshold claude 15
```

There is no verified `1755` account-switch cutoff in this stack. OpenAI's
current Codex documentation says usage limits vary with model and task
complexity; current limits are inspected through the product status surface,
not treated as one permanent cross-account number.

Source: [OpenAI Codex pricing and usage limits](https://learn.chatgpt.com/docs/pricing).

The router runs at a process boundary because a running Codex or Claude process
cannot change credential stores in place. If a live worker later hits a quota or
credential stop, FirstMate preserves its worktree and uses its ordinary
controlled relaunch. The replacement keeps the original harness and re-runs the
account selector. If no same-provider profile is provably usable, the relaunch
stops; it never falls through from Codex to Claude or vice versa.

Inspect leases without seeing credentials:

```sh
./scripts/account-router.mjs status
```

Lease keys hash the FirstMate home and include the task ID, so identical task
names in different FirstMate homes do not collide. Teardown removes a lease
only after the corresponding task record is successfully removed.

The selector is tested with disposable quota fixtures, including actual
FirstMate spawn validation and cross-provider rejection. Live account-to-account
rollover is not yet claimed because this machine currently has no verified
Codex account2 or Claude account2. Adding one later activates the already-built
path; it does not require a new harness identifier or dispatch rule.

Verify the deterministic implementation:

```sh
node --test tests/account-router.test.mjs
FIRSTMATE_REPO="$HOME/src/firstmate" ./scripts/verify-firstmate.sh
```

For the tested add, retire, archive, reactivate, promote, and selected-profile
verification procedures, see [account lifecycle](account-lifecycle.md).
