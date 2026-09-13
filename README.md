# FirstMate multi-harness setup

A reproducible macOS setup for running Pi as a FirstMate coordinator, dispatching
Pi, Codex CLI, and Claude Code workers through Herdr, and isolating their Git
work with Treehouse.

This repository uses one isolated primary account per commercial worker harness
and supports optional numbered accounts when they are actually available.
Account1 is the deterministic initial primary. The included account router
performs same-provider selection at each worker spawn or controlled relaunch: Codex may
rotate only among active Codex profiles, and Claude only among active Claude
profiles. It fails closed on stale, unknown, tied, or exhausted evidence.

The repository also includes a secret-safe Herdr plugin with **Account Fleet**
and **Computer Projects** terminal overlays. It can launch the FirstMate
coordinator, open Pi's `/login` flow, manage account-routing metadata, and build
a private read-only project catalog across the current user's home. Vendor
authentication and project intake remain explicit, approval-gated operations.

## Verification status

Audited on Apple Silicon macOS 26.3 through 2026-09-12:

- the pinned command-line tools and their current help surfaces were checked;
- FirstMate dispatch schema, precedence, supported harness names, and invalid
  configuration behavior were verified at commit
  `6c1d2db194cb20e08232ba2fa2c414592f724b44`;
- Herdr integration revision v8 is current for Pi and all three Codex/Claude
  profile pairs;
- the account wrappers preserve arguments and select their intended profile;
- `quota-axi` returned separate profile-scoped results;
- Herdr accepted the Account Fleet plugin manifest, its 28 isolated account,
  router, project discovery, lifecycle, approval, and redaction tests pass, and
  both primary profiles passed its sanitized live readiness view in the earlier
  documented NVM-shell audit;
- the Account Fleet pane opened successfully as a live Herdr overlay and
  rendered only the expected Codex/Claude account1 routing metadata;
- the Account Fleet launch action created a live coordinator tab, ran the
  launcher, and Pi loaded the FirstMate instructions, skills, and extensions;
- a whole-home project scan classified canonical Git projects, non-Git project
  candidates, collapsed generated-worktree/reference collections, and
  FirstMate itself without reading project file contents;
- the live Pi coordinator answered a harmless message at `xhigh` reasoning;
- an approved project intake created 26 managed-project records and 26 import
  briefs, and Herdr showed Codex workers operating in isolated Treehouse
  worktrees under the implementation-heavy dispatch rule;
- the account selector's disposable-profile tests passed, covering primary
  preference, same-provider rollover, sticky task leases, profile isolation,
  threshold policy, stale/unknown/tied refusal, and cross-provider refusal;
- the custom FirstMate patch passed the complete spawn dispatch-profile
  regression, including account selection and malicious cross-provider output;
- teardown passed the new proof that a task lease is released only after its
  task record is removed. A later unrelated Herdr preflight case still failed,
  so the complete teardown suite is not claimed green;
- the audit machine returned fresh evidence for both primaries in the final
  2026-09-12 full verification. One earlier probe that day returned
  stale/unknown Codex evidence, which the router correctly treated as a blocker
  rather than capacity.

Still required before this build can claim end-to-end live routing:

- display `/session` or the Pi footer to capture the exact live coordinator
  provider/model ID;
- dispatch one controlled Pi and Claude worker through the live coordinator,
  and carry one controlled Codex import through its complete delivery path;
- authenticate a second profile and execute one live controlled same-provider
  rollover for each provider before claiming live multi-account failover.

The default and account2 stores are optional and are not consulted by the clean
primary-only verification path.

Run the read-only checks at any time:

```sh
./scripts/verify-all.sh
```

## What you are building

```text
                              USER
                                │
                                ▼
                         Pi + FirstMate
                          COORDINATOR
                                │
                         task classification
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
               Pi             Codex           Claude
            worker harness   worker harness   worker harness
                                │               │
                         account layer     account layer
                                │               │
                     ┌──────────┼──────┐  ┌─────┼──────────┐
                     ▼          ▼      ▼  ▼     ▼          ▼
                  codex1      codex  codex2  claude1    claude  claude2
                  preferred                  preferred
                                │
                                ▼
                              Herdr
                                │
                                ▼
                            Treehouse
                                │
                                ▼
                       isolated Git worktrees
                                │
                                ▼
                            Git projects
```

These are separate layers:

| Layer | Component | Purpose |
| --- | --- | --- |
| Model | GPT, Claude, and other models | Produces model output. |
| Harness | Pi, Codex CLI, Claude Code | Runs a coding-agent process. |
| Orchestrator | FirstMate | Classifies tasks, dispatches workers, and reconciles work. |
| Session backend | Herdr | Keeps worker terminal endpoints and sessions available. |
| Code isolation | Treehouse | Leases isolated Git worktrees. |
| Account routing | Account Fleet + `account-router.mjs` | Selects an active credential store inside the already-chosen provider without copying it. |
| Provider capacity | `quota-axi` | Reports capacity evidence; it does not route or launch a worker. |

FirstMate is not a model, harness executable, or terminal multiplexer. A
FirstMate source clone supplies instructions, skills, scripts, state, and local
configuration to the Pi coordinator.

Read [the detailed architecture](docs/architecture.md) before changing the
routing boundary.

## Why each component exists

- **FirstMate** is the orchestration and worker-supervision layer.
- **Pi** is the primary coordinator harness and remains an available worker.
- **Herdr** is FirstMate's persistent terminal/session backend in this setup.
- **Treehouse** prevents workers from sharing one mutable Git checkout.
- **Codex CLI** is the implementation/debugging worker default.
- **Claude Code** is the architecture/review/long-form writing worker default.
- **`quota-axi`** supplies current capacity evidence for profile-array reasoning.
- **`tasks-axi`** supplies structured task/backlog operations.
- **`gh-axi`** supplies GitHub operations used by FirstMate workflows.
- **`chrome-devtools-axi`** supplies browser and DevTools operations.
- **`lavish-axi`** supplies rich review and annotation workflows.
- **No Mistakes** supplies FirstMate's guarded delivery pipeline when a project
  selects that delivery mode.

Verification:

```sh
./scripts/verify-prerequisites.sh
```

## Prerequisites

The clean path targets a fresh Apple Silicon Mac with Zsh, Apple Command Line
Tools, Homebrew, NVM, a GitHub account, and access to the AI subscriptions you
intend to authenticate.

Audited core versions:

```text
Node 22.21.1       Pi 0.84.4          Herdr 0.8.2
Treehouse 2.3.0    Codex CLI 0.151.0  Claude Code 2.1.270
No Mistakes 1.60.2
```

The exact AXI versions and FirstMate compatibility floors are in
[prerequisites](docs/prerequisites.md).

Verification:

```sh
sw_vers
uname -m
xcode-select -p
```

## Installation

All commands in this section run in a normal macOS terminal.

1. Install Apple Command Line Tools if needed, then Homebrew and base tools:

   ```sh
   xcode-select --install
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   brew install gh jq
   gh auth login
   ```

2. Install NVM using its current documented installer, then the audited Node
   release:

   ```sh
   touch "$HOME/.zshrc"
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh | bash
   ```

   Open a fresh terminal, then:

   ```sh
   nvm install 22.21.1
   nvm alias default 22.21.1
   nvm use default
   ```

3. Install the pinned npm tools:

   ```sh
   npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.84.4
   npm install -g \
     @openai/codex@0.151.0 \
     @anthropic-ai/claude-code@2.1.270 \
     quota-axi@0.1.34 \
     tasks-axi@0.2.5 \
     gh-axi@0.1.35 \
     chrome-devtools-axi@0.1.33 \
     lavish-axi@0.1.63
   ```

4. Install Herdr, Treehouse, and No Mistakes from their official installers:

   ```sh
   curl -fsSL https://herdr.dev/install.sh | sh
   curl -fsSL https://kunchenguid.github.io/treehouse/install.sh | sh
   curl -fsSL https://raw.githubusercontent.com/kunchenguid/no-mistakes/main/docs/install.sh | sh
   ```

5. Clone this repository and FirstMate side by side:

   ```sh
   mkdir -p "$HOME/src"
   cd "$HOME/src"
   git clone https://github.com/chinedunnaji-bit/firstmate-multi-harness.git
   git clone https://github.com/kunchenguid/firstmate.git
   git -C "$HOME/src/firstmate" checkout --detach \
     6c1d2db194cb20e08232ba2fa2c414592f724b44
   ```

6. Continue with [the exact installation procedure](docs/installation.md) to
   install account wrappers, authenticate each isolated profile, install Herdr
   integrations and AXI hooks, apply the tested FirstMate patch, and copy the
   dynamic dispatch configuration.

Installation verification:

```sh
cd "$HOME/src/firstmate-multi-harness"
./scripts/verify-all.sh
```

The detached FirstMate revision is intentional: it makes the tested patch and
dispatch behavior reproducible instead of silently following a moving branch.

Do not continue past a failure. Use [troubleshooting](docs/troubleshooting.md),
which distinguishes the observed symptom, root cause, fix, and proof.

## Authentication

Authentication is interactive and happens outside this repository. Never copy
one account's credential files into another account directory.

Authenticate the Codex primary:

```sh
codex1 login
```

Authenticate the Claude primary:

```sh
claude1 auth login
```

You do not need a default, account2, or matching number of accounts across
providers. Add optional profiles later using
[account lifecycle](docs/account-lifecycle.md).

Pi has an independent credential store. Start Pi:

```sh
pi
```

Then enter this **inside Pi**:

```text
/login
```

Complete the browser flow for the intended coordinator provider.

Authentication verification:

```sh
pi --offline --list-models
./scripts/verify-harnesses.sh
```

The verifier reports only usable/unusable state. It does not print identities,
tokens, or quota amounts.

## First launch

Run this in a normal terminal to enter the shared workspace and attach Herdr:

```sh
cd "$HOME/src"
herdr
```

Open Account Fleet and use its coordinator action row:

```sh
herdr plugin pane open \
  --plugin firstmate.account-fleet \
  --entrypoint accounts
```

Press `L`, then type `launch`. The action runs the equivalent of this manual
fallback from the setup repository's actual checkout:

```sh
cd "$HOME/src/firstmate-multi-harness"
./scripts/launch-firstmate.sh
```

It opens a `firstmate-coordinator` Herdr tab and refuses to create a duplicate
when a FirstMate Pi agent already exists. Select that tab, inspect and approve
Pi's project trust prompt, and wait until Pi is idle. Reopen Account Fleet and
press `/` to deliver the `/login` slash command to that coordinator and focus
its tab. Complete the provider/browser flow in Pi.

The two actions are intentionally separate: a first-run trust prompt may block
Pi before slash commands are available. Passing `/login` as a Pi startup
argument was tested and does not execute it as a slash command.

For the first controlled check, ask the coordinator for three bounded,
read-only scouts, explicitly selecting Pi, Codex, and Claude one at a time. Only
after these pass should you rely on natural-language dynamic rules.

First-launch verification:

```sh
./scripts/verify-herdr-integrations.sh
FIRSTMATE_REPO="$HOME/src/firstmate" ./scripts/verify-firstmate.sh
```

## Dynamic harness routing

`examples/crew-dispatch.json` leaves `config/crew-harness` absent and routes:

| Task | Worker harness | Effort |
| --- | --- | --- |
| Implementation, debugging, tests, refactors | Codex | high |
| Architecture review, adversarial review, long-form writing | Claude | high |
| Coordination, triage, bounded research, documentation synthesis | Pi | medium |
| No matching rule | Pi | medium |

Verified precedence is explicit task override, best-fitting rule, dispatch-file
default, static `crew-harness`, then coordinator harness. This repository does
not create the static file.

Models are omitted until their exact identifiers are verified under the
authenticated harness. Invalid JSON and unrecognized names such as `codex1`
fail closed.

Routing verification:

```sh
cd "$HOME/src/firstmate"
FM_BOOTSTRAP_DETECT_ONLY=1 \
FM_BOOTSTRAP_NETWORK=skip \
FM_BOOTSTRAP_VERBOSE_FACTS=1 \
  bin/fm-bootstrap.sh
```

See [multi-harness routing](docs/multi-harness-routing.md) for profile arrays,
model/effort mapping, explicit overrides, and invalid configuration behavior.

## Multiple accounts

Account routing is below harness routing:

```text
FirstMate -> codex harness  -> CODEX_HOME profile
FirstMate -> claude harness -> CLAUDE_CONFIG_DIR profile
```

Real wrappers in `$HOME/.local/bin` provide explicit selection:

```text
codex1 preferred  $HOME/.codex-account1
codex optional    $HOME/.codex
codex2 optional   $HOME/.codex-account2

claude1 preferred  $HOME/.claude-account1
claude optional    $HOME/.claude
claude2 optional   $HOME/.claude-account2
```

Do not put `codex1` or `claude1` in FirstMate dispatch JSON. They are account
launchers, not recognized harness identifiers.

This account layer applies to Codex CLI and Claude Code workers. It does not
change the model/provider login used by the running Pi coordinator; Pi keeps its
own authentication under `PI_CODING_AGENT_DIR`.

At the audited FirstMate commit, upstream worker launch already forwarded
`CLAUDE_CONFIG_DIR` but not `CODEX_HOME`, and it had no account-profile selector.
This repository carries a tested patch that calls the local router after harness
resolution, validates that its provider did not change, records the sanitized
profile label, forwards the selected directory, and releases its task lease at
teardown.

Account verification:

```sh
codex1 --version
claude1 --version
./scripts/verify-harnesses.sh
node --test tests/account-router.test.mjs
```

See [multi-account routing](docs/multi-account-routing.md) for the sanitized
quota matrix and router contract. See
[account lifecycle](docs/account-lifecycle.md) for adding, independently
verifying, retiring, archiving, reactivating, or promoting profiles.

## Account Fleet UI

Link the local Herdr plugin once:

```sh
cd "$HOME/src/firstmate-multi-harness"
herdr plugin link plugins/account-fleet --enabled
```

With a Herdr workspace active, open its terminal overlay:

```sh
herdr plugin pane open \
  --plugin firstmate.account-fleet \
  --entrypoint accounts
```

New profiles start as `planned` and cannot become active until wrapper,
directory, login, Herdr integration, and strict quota checks all pass. Retire
and forget operations do not log out or delete files. Press `a` to enable or
disable same-provider automatic selection for the selected provider; press `t`
to set an explicit remaining-quota floor. The default floor is `0%`, so the
repository does not invent a percentage policy. See
[Account Fleet UI](docs/account-ui.md) for controls, security boundaries, and
verification.

The top action row is keyboard-operated:

```text
[ L  Launch FirstMate ]  [ /  Open Pi Login ]
```

This is the supported plugin UI: Herdr v1 exposes managed terminal panes, not a
custom browser dashboard or native clickable control API. Herdr itself remains
the visual workspace for tabs, panes, persistence, and agent status; Pi remains
the interactive coordinator UI.

UI verification:

```sh
./scripts/verify-account-ui.sh
```

## Computer-wide project catalog

FirstMate's managed projects do not need to originate in one workspace folder.
The same local Herdr plugin can discover Git and non-Git project candidates
across the current user's Desktop, Documents, Downloads, `src`, and other home
directories without reading file contents:

```sh
herdr plugin pane open \
  --plugin firstmate.account-fleet \
  --entrypoint projects
```

Press `S` to scan, `f` to include generated/reference rows, `i` to ask the idle
FirstMate coordinator to inspect one candidate read-only, or `A` to request a
read-only deduplication review of the whole private catalog. Discovery never
registers or clones a project. FirstMate must propose canonical projects and
wait for explicit approval before intake.

The scanner excludes credential/configuration directories, macOS Library data,
dependencies, caches, and build artifacts. Sensitive document projects are
always opt-in because later agent work—not discovery—may send selected content
to the configured provider. See [Computer Projects UI](docs/project-ui.md).

Project UI verification:

```sh
./scripts/verify-account-ui.sh
```

## Daily usage

Attach or reattach:

```sh
cd "$HOME/src"
herdr
```

Detach without stopping workers:

```text
Ctrl-b, release, then q
```

Reattach with `herdr`. To intentionally stop the default Herdr server and its
pane processes, finish or reconcile work first, then run:

```sh
herdr server stop
```

Do not use server stop as a detach command. Herdr, Treehouse, No Mistakes, npm
tools, and the locally patched FirstMate checkout have different update
procedures; [daily usage](docs/daily-usage.md) documents each one and the safe
FirstMate patch reversal/reapplication sequence.

Daily verification:

```sh
./scripts/verify-all.sh
```

## Troubleshooting and build history

- [Troubleshooting](docs/troubleshooting.md) preserves only real encountered
  failures.
- [Build log](notes/build-log.md) records the chronological attempts, relevant
  results, established causes, and working resolutions.
- [Installation](docs/installation.md) contains only the resulting clean path.

Troubleshooting verification is the `### Verify` command in each relevant
entry; do not accept a fix based only on the absence of the original message.

## Security

These coding agents can execute commands and access files with the permissions
of the operating-system user running them. Herdr persistence does not reduce
those permissions, and Treehouse is Git isolation rather than an OS sandbox.

Never commit authentication JSON, OAuth tokens, API keys, cookies, Keychain
content, SSH private keys, credential directories, or secret-bearing `.env`
files. All published wrappers use `$HOME` and select existing stores without
copying them.

Before every public push:

```sh
git status
git diff --cached
git grep -nEi 'api[_-]?key|token|secret|password|authorization|bearer'
./scripts/check-publication.sh
```

Read [security](docs/security.md) and inspect every match before publishing.

## Source documentation

Primary project references are linked on the page that uses them. Start with:

- [FirstMate](https://github.com/kunchenguid/firstmate)
- [Pi](https://github.com/earendil-works/pi)
- [Herdr](https://herdr.dev/docs/)
- [Treehouse](https://github.com/kunchenguid/treehouse)
- [Codex CLI](https://github.com/openai/codex)
- [Claude Code](https://code.claude.com/docs/en/overview)
- [quota-axi](https://github.com/kunchenguid/quota-axi)
- [No Mistakes](https://github.com/kunchenguid/no-mistakes)

## License

[MIT](LICENSE)
