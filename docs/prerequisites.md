# Prerequisites

## Supported target

This guide targets a fresh Apple Silicon Mac using Zsh and a per-user NVM
installation. The audit host was:

```text
macOS 26.3
arm64
Zsh
```

That is a verified baseline, not a claim that every component requires macOS
26.3. If you use an Intel Mac, another Node manager, or another shell, keep the
same version and `PATH` invariants and treat the variation as unverified until
you run the repository's checks.

Before installing the agent stack, you need:

- Apple Command Line Tools or Xcode selected with `xcode-select`;
- a working internet connection for installation and authentication;
- a GitHub account and GitHub CLI authentication;
- access to whichever Codex and Claude plans you intend to use;
- permission to store each CLI's credentials in its normal local store or the
  macOS Keychain.

## Audited versions

The following versions were installed and exercised through 2026-09-04:

| Component | Audited version | Verification |
| --- | ---: | --- |
| macOS | 26.3 arm64 | `sw_vers && uname -m` |
| NVM | 0.40.1 on the audit host; current official install instructions showed 0.40.7 | `nvm --version` |
| Node.js | 22.21.1 | `node --version` |
| npm | 10.9.4 | `npm --version` |
| Pi | 0.84.4 | `pi --version` |
| Herdr | 0.8.2 | `herdr --version` |
| Treehouse | 2.3.0 | `treehouse --version` |
| Codex CLI | 0.151.0 | `codex --version` |
| Claude Code | 2.1.261 | `claude --version` |
| `quota-axi` | 0.1.34 | `quota-axi --version` |
| `tasks-axi` | 0.2.5 | `tasks-axi --version` |
| `gh-axi` | 0.1.35 | `gh-axi --version` |
| `chrome-devtools-axi` | 0.1.33 | `chrome-devtools-axi --version` |
| `lavish-axi` | 0.1.63 | `lavish-axi --version` |
| No Mistakes | 1.60.2 | `no-mistakes --version` |
| GitHub CLI | 2.83.2 | `gh --version` |
| jq | 1.8.1 | `jq --version` |
| FirstMate source | `6c1d2db194cb20e08232ba2fa2c414592f724b44` | `git -C "$HOME/src/firstmate" rev-parse HEAD` |

The npm commands in the installation guide pin the audited JavaScript package
versions. Herdr, Treehouse, and No Mistakes use their official release
installers; record the version those installers deliver and require at least the
FirstMate floors below.

## Relevant FirstMate floors at the audited commit

The audited FirstMate source required or feature-probed:

| Tool | Floor/requirement |
| --- | --- |
| Herdr | protocol 14 or newer; 0.8.0 or newer for default presentation spaces |
| Treehouse | `treehouse get --lease` must be available |
| No Mistakes | 1.46.0 or newer |
| `gh-axi` | 0.1.29 or newer |
| `lavish-axi` | 0.1.46 or newer |
| `tasks-axi` | 0.2.4 or newer |
| `quota-axi` | 0.1.29 or newer |

FirstMate's own bootstrap is authoritative if these floors change. The versions
above describe the audited commit, not an eternal compatibility promise.

Source: [FirstMate configuration/toolchain](https://github.com/kunchenguid/firstmate/blob/6c1d2db194cb20e08232ba2fa2c414592f724b44/docs/configuration.md#toolchain).

## Node, NVM, and global npm packages

NVM is invoked per shell and keeps global npm packages under a version-specific
prefix:

```text
$HOME/.nvm/versions/node/v20.19.5/lib/node_modules
$HOME/.nvm/versions/node/v22.21.1/lib/node_modules
```

The audit host contained Pi 0.74.2 under Node 20 and Pi 0.84.4 under Node 22.
Switching Node versions changed both `command -v pi` and `pi --version`:

```text
node=v20.19.5 pi=0.74.2 path=$HOME/.nvm/versions/node/v20.19.5/bin/pi
node=v22.21.1 pi=0.84.4 path=$HOME/.nvm/versions/node/v22.21.1/bin/pi
```

Installed package metadata showed:

```text
Pi 0.74.2: Node >=20.6.0
Pi 0.84.4: Node >=22.19.0
quota-axi 0.1.34: Node >=22.19
Claude Code 2.1.261: Node >=22.0.0
```

This is why the clean path sets Node 22.21.1 as the NVM default before installing
global packages. Herdr panes commonly start fresh shells; if NVM's default still
points to Node 20, they can select the old global package set even when an
existing terminal was manually switched to Node 22.

NVM's official documentation describes it as a per-user, per-shell version
manager and documents the install/default behavior.

Source: [NVM](https://github.com/nvm-sh/nvm).

## Accounts and subscriptions

This repository never supplies or copies authentication. You provide:

- one Pi coordinator provider login;
- one isolated Codex CLI login, with optional additional numbered profiles;
- one isolated Claude Code login, with optional additional numbered profiles;
- GitHub CLI authentication.

Pi's current provider documentation lists ChatGPT Plus/Pro (Codex) and Claude
Pro/Max among its interactive `/login` choices. It also warns that third-party
Pi use of a Claude Pro/Max login draws from Anthropic extra usage rather than the
normal Claude plan allowance. Choose deliberately.

Sources: [Pi providers](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md),
[Codex authentication](https://developers.openai.com/codex/auth),
[Claude Code environment variables](https://code.claude.com/docs/en/env-vars).

## Pre-install check

On an existing machine, run:

```sh
./scripts/verify-prerequisites.sh
```

On a genuinely fresh machine this will fail until installation is complete.
That is expected: every failure names the missing command or invariant without
displaying credentials.
