# Pi setup

Pi is both the primary FirstMate coordinator harness in this stack and an
available worker harness. Those are separate runtime roles even though the
executable is the same.

## Install the audited Pi release

Run under the Node 22 NVM default:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.84.4
```

Verify:

```sh
node --version
command -v pi
pi --version
pi --help
```

Audited result:

```text
Node v22.21.1
Pi 0.84.4
```

Current help confirms `--model`, `--thinking`, `--list-models`, `--continue`,
`--resume`, and `--tui-mode`. Pi 0.84.4 package metadata declares Node
`>=22.19.0`.

Source: [Pi repository](https://github.com/earendil-works/pi).

## Why an older Pi can remain visible

The audit host originally had:

```text
Node v20.19.5 -> Pi 0.74.2
Node v22.21.1 -> Pi 0.84.4
```

NVM stores global npm packages inside each Node version. `npm install -g` under
Node 22 does not replace the Pi executable under Node 20. A terminal that still
uses Node 20 will continue to find the older binary.

Diagnosis:

```sh
node --version
command -v pi
pi --version
npm prefix -g
nvm version default
```

Resolution:

```sh
nvm alias default 22.21.1
nvm use default
```

Open a fresh terminal and rerun the diagnosis. Do not delete the Node 20
installation merely to fix `PATH`; retaining it is harmless when the default is
correct.

## Authenticate the coordinator

Pi owns its own provider store under `$PI_CODING_AGENT_DIR`, whose default is
`$HOME/.pi/agent`. It does not automatically reuse a login from Codex CLI or
Claude Code.

Start Pi:

```sh
pi
```

Inside Pi:

```text
/login
```

Choose the provider deliberately. Current installed documentation lists:

- ChatGPT Plus/Pro (Codex);
- Claude Pro/Max;
- GitHub Copilot;
- xAI subscriptions;
- OpenRouter;
- Radius.

The preferred audited coordinator choice is ChatGPT Plus/Pro (Codex). Pi's
provider guide states that Claude Pro/Max use from a third-party harness draws
from Anthropic extra usage rather than ordinary plan limits.

After completing the browser flow, exit Pi and verify:

```sh
pi --offline --list-models
```

Before authentication the audited output was:

```text
No models available. Use /login to log into a provider via OAuth or API key.
```

Strict, non-refreshing diagnosis is also available:

```sh
pi auth check --provider openai-codex --json --no-refresh
```

Do not use Pi's credential-printing auth subcommands in logs or verification
scripts.

Source: [Pi provider authentication](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md).

## Install the Herdr integration

Herdr creates Pi's `extensions` directory only when the resolved Pi agent root
already exists. The clean sequence is:

```sh
mkdir -p "$HOME/.pi/agent"
herdr integration install pi
herdr integration status
```

Expected status:

```text
pi: current (v8) ($HOME/.pi/agent/extensions/herdr-agent-state.ts)
```

The `v8` value is Herdr's integration revision, not the Pi application version.

If you set `PI_CODING_AGENT_DIR`, use the same value when installing, checking,
and launching Pi.

Source: [Herdr Pi integration](https://herdr.dev/docs/integrations/#pi).

## Start Pi as FirstMate

The coordinator must start from the FirstMate clone so it loads FirstMate's
tracked instructions and Pi extensions:

```sh
cd "$HOME/src/firstmate"
CODEX_HOME="$HOME/.codex-account1" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  pi
```

On the first launch, approve Pi's project trust prompt for this clone so its
tracked `.pi/extensions/*.ts` files can load. This trust applies to the
FirstMate source clone; inspect that clone before approving it.

The accompanying `CODEX_HOME` and `CLAUDE_CONFIG_DIR` values choose the preferred
worker stores. Claude forwarding is current upstream behavior; Codex forwarding
comes from this repository's tested FirstMate patch.

## Coordinator versus Pi worker

- The coordinator is the Pi session in the FirstMate home.
- A Pi worker is a separate Pi process spawned by FirstMate for one task.
- Herdr owns both terminal endpoints.
- Treehouse gives the worker its task worktree.
- `crew-dispatch.json` decides when the Pi worker harness is selected.

No `config/crew-harness=pi` file is used. Such a static setting would defeat the
intended dynamic Pi/Codex/Claude routing.
