# Herdr setup

Herdr is the persistent terminal and session backend. It is not the
orchestrator and it does not create Git worktrees. FirstMate orchestrates;
Treehouse isolates code.

FirstMate's current documentation describes the Herdr backend as experimental.
The audited combination is Herdr 0.8.2 with FirstMate commit
`6c1d2db194cb20e08232ba2fa2c414592f724b44`.

## Install

Use Herdr's stable-channel installer:

```sh
curl -fsSL https://herdr.dev/install.sh | sh
```

Open a fresh terminal if necessary, then verify:

```sh
command -v herdr
herdr --version
```

Audited result:

```text
herdr 0.8.2
```

Source: [Herdr installation](https://herdr.dev/docs/install/).

## Install integrations

Pi:

```sh
mkdir -p "$HOME/.pi/agent"
herdr integration install pi
```

Codex:

```sh
CODEX_HOME="$HOME/.codex-account1" herdr integration install codex
```

Claude Code:

```sh
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" herdr integration install claude
```

Herdr respects `PI_CODING_AGENT_DIR`, `CODEX_HOME`, and
`CLAUDE_CONFIG_DIR`. The target directory must already exist for each selected
profile.

Source: [Herdr integrations](https://herdr.dev/docs/integrations/).

## Reproduced Pi integration failure

### Goal

Confirm the previously reported failure without changing the working Pi profile.

### Command

The audit pointed `PI_CODING_AGENT_DIR` at a disposable missing directory:

```sh
audit_root=$(mktemp -d /private/tmp/herdr-pi-missing.XXXXXX)
PI_CODING_AGENT_DIR="$audit_root/missing-agent" \
  herdr integration install pi
```

### Expected behavior

Herdr should refuse because the Pi agent root is absent.

### Actual result

```text
pi extension directory not found at <temporary-directory>/missing-agent/extensions. install pi first
```

Exit status: `1`.

### Root cause

Herdr will create the `extensions` child only after the resolved Pi agent root
exists. `pi --version` proves that the executable is installed, but it does not
prove that the agent configuration directory exists.

### Resolution

Create the agent root, not an authentication file:

```sh
mkdir -p "$HOME/.pi/agent"
herdr integration install pi
```

The same fix was reproduced in a disposable path where only the parent existed;
Herdr created `extensions/herdr-agent-state.ts` itself.

### Verification

```sh
herdr integration status
```

Expected relevant line:

```text
pi: current (v8) ($HOME/.pi/agent/extensions/herdr-agent-state.ts)
```

## Verify selected accounts

From this setup repository:

```sh
./scripts/verify-herdr-integrations.sh
```

The script checks Pi plus Codex account1 and Claude account1 by default. It
reports only current/not-current status and does not print resolved profile
paths or credential data.

Select optional profiles independently when they exist:

```sh
FM_VERIFY_CODEX_PROFILES="account1 account2" \
FM_VERIFY_CLAUDE_PROFILES=account1 \
  ./scripts/verify-herdr-integrations.sh
```

See [account lifecycle](account-lifecycle.md) before adding or retiring a
profile.

## Select Herdr for FirstMate

The installation guide copies the tested value into FirstMate's local ignored
configuration:

```text
config/backend -> herdr
```

FirstMate can also auto-detect Herdr from `HERDR_ENV=1`, but the explicit local
file makes the intended backend reproducible and independently verifiable.

Verify:

```sh
test "$(tr -d '[:space:]' < "$HOME/src/firstmate/config/backend")" = herdr
```

Source: [FirstMate Herdr backend](https://github.com/kunchenguid/firstmate/blob/6c1d2db194cb20e08232ba2fa2c414592f724b44/docs/herdr-backend.md).

## Start, detach, and reattach

Start or attach the default Herdr session:

```sh
herdr
```

Detach without stopping pane processes:

```text
Ctrl-b, release, then q
```

Reattach:

```sh
herdr
```

Named session example:

```sh
herdr session attach firstmate
```

Use a named session only if you also use that name consistently in daily
operation. This guide's clean path uses the default session.

## Shutdown and updates

`herdr server stop` stops the default server and exits its pane processes. It is
not equivalent to detach. Do not run it merely to leave the UI.

For a direct installer-managed Herdr installation:

```sh
herdr update
```

Herdr may require a server restart when the client/server protocol changes.
Stopping the old server exits pane processes, so reconcile or finish active work
first. `herdr update --handoff` is documented as experimental and is not the
recommended clean path here.

Sources: [Herdr persistence](https://herdr.dev/docs/persistence-remote/),
[Herdr session restore](https://herdr.dev/docs/session-state/),
[Herdr update behavior](https://herdr.dev/docs/install/#update).
