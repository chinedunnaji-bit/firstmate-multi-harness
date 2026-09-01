# Installation

This is the clean path derived from the audited build. Commands in this page run
in a normal macOS terminal unless a step explicitly says **inside Pi** or
**inside Herdr**.

The public repository and local clone directory are both named
`firstmate-multi-harness`.

## 1. Install Apple tools and Homebrew

Request Apple's developer tools if they are not already installed:

```sh
xcode-select --install
```

Install Homebrew using its current official command:

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the installer's printed `PATH` instructions, then open a fresh terminal.

Install the non-Node command-line prerequisites:

```sh
brew install gh jq
gh auth login
```

Verify without printing the authenticated identity or token:

```sh
command -v git
command -v gh
command -v jq
gh auth status >/dev/null
```

Sources: [Homebrew](https://brew.sh/),
[GitHub CLI authentication](https://cli.github.com/manual/gh_auth_login).

## 2. Install NVM and Node 22

The current official NVM documentation used version 0.40.7 when this guide was
written:

```sh
touch "$HOME/.zshrc"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh | bash
```

Open a fresh terminal so Zsh loads NVM. Then install and select the audited Node
release:

```sh
nvm install 22.21.1
nvm alias default 22.21.1
nvm use default
```

Verify:

```sh
node --version
npm --version
nvm version default
npm prefix -g
```

Expected Node result:

```text
v22.21.1
```

The global prefix should be below
`$HOME/.nvm/versions/node/v22.21.1/`. Do not use `sudo npm install -g` with this
per-user NVM setup.

Source: [NVM installation](https://github.com/nvm-sh/nvm#installing-and-updating).

## 3. Install Pi, worker harnesses, and AXI tools

Install the exact audited package set under Node 22:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.84.4
npm install -g \
  @openai/codex@0.151.0 \
  @anthropic-ai/claude-code@2.1.252 \
  quota-axi@0.1.34 \
  tasks-axi@0.2.5 \
  gh-axi@0.1.35 \
  chrome-devtools-axi@0.1.33 \
  lavish-axi@0.1.63
```

Verify from the same fresh Node 22 shell:

```sh
pi --version
codex --version
claude --version
quota-axi --version
tasks-axi --version
gh-axi --version
chrome-devtools-axi --version
lavish-axi --version
```

Expected audited versions are listed in [prerequisites](prerequisites.md). Pi
0.84.4 requires Node 22.19.0 or newer. If `pi --version` still reports 0.74.2,
stop here and use the NVM diagnosis in [troubleshooting](troubleshooting.md).

Sources: [Pi](https://github.com/earendil-works/pi),
[Codex CLI](https://github.com/openai/codex),
[Claude Code](https://github.com/anthropics/claude-code),
[quota-axi](https://github.com/kunchenguid/quota-axi),
[tasks-axi](https://github.com/kunchenguid/tasks-axi),
[gh-axi](https://github.com/kunchenguid/gh-axi),
[chrome-devtools-axi](https://github.com/kunchenguid/chrome-devtools-axi),
[lavish-axi](https://github.com/kunchenguid/lavish-axi).

## 4. Install Herdr, Treehouse, and No Mistakes

Use each project's official installer:

```sh
curl -fsSL https://herdr.dev/install.sh | sh
curl -fsSL https://kunchenguid.github.io/treehouse/install.sh | sh
curl -fsSL https://raw.githubusercontent.com/kunchenguid/no-mistakes/main/docs/install.sh | sh
```

Open a fresh terminal if an installer added `$HOME/.local/bin` to `PATH`.

Verify:

```sh
herdr --version
treehouse --version
treehouse get --help | grep -- --lease
no-mistakes --version
no-mistakes axi --help >/dev/null
```

Sources: [Herdr installation](https://herdr.dev/docs/install/),
[Treehouse](https://github.com/kunchenguid/treehouse),
[No Mistakes](https://github.com/kunchenguid/no-mistakes).

## 5. Clone this setup repository and FirstMate

Keep the setup repository and FirstMate side by side:

```sh
mkdir -p "$HOME/src"
cd "$HOME/src"
git clone https://github.com/chinedunnaji-bit/firstmate-multi-harness.git
git clone https://github.com/kunchenguid/firstmate.git
git -C "$HOME/src/firstmate" checkout --detach \
  6c1d2db194cb20e08232ba2fa2c414592f724b44
```

Record the exact FirstMate revision:

```sh
git -C "$HOME/src/firstmate" rev-parse HEAD
```

The result must be:

```text
6c1d2db194cb20e08232ba2fa2c414592f724b44
```

The detached checkout is intentional. FirstMate develops on its moving main
branch, while this guide's patch and dispatch behavior were tested at the exact
revision above. [Daily usage](daily-usage.md) documents the separate, deliberate
update path.

Verify:

```sh
test -f "$HOME/src/firstmate/AGENTS.md"
test -x "$HOME/src/firstmate/bin/fm-bootstrap.sh"
test "$(git -C "$HOME/src/firstmate" rev-parse HEAD)" = \
  6c1d2db194cb20e08232ba2fa2c414592f724b44
```

## 6. Install executable account wrappers

Install the generic examples as real executables. They contain `$HOME`-relative
paths only and never copy credentials:

```sh
install -d "$HOME/.local/bin"
install -m 0755 "$HOME/src/firstmate-multi-harness/examples/codex1-wrapper.sh" \
  "$HOME/.local/bin/codex1"
install -m 0755 "$HOME/src/firstmate-multi-harness/examples/claude1-wrapper.sh" \
  "$HOME/.local/bin/claude1"
```

Ensure `$HOME/.local/bin` is on `PATH`. Add this after NVM setup in
`$HOME/.zshrc` if necessary:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

Open a fresh terminal and verify argument preservation:

```sh
codex1 --version
claude1 --version
```

The wrapper verification was tested from a fresh Node 22 login shell. A
long-lived Node 20 shell selected the older globally installed harnesses, which
is why a fresh terminal is part of the procedure.

Account2 and later wrappers are optional. Install them only when the
corresponding vendor account exists; see
[account lifecycle](account-lifecycle.md).

## 7. Authenticate the primary worker profiles

Authentication is interactive. Never paste credentials into this repository or
copy one profile's authentication file into another profile.

Codex:

```sh
codex1 login
```

Claude Code:

```sh
claude1 auth login
```

Verify login status without printing account details:

```sh
codex1 login status >/dev/null

CLAUDE_CONFIG_DIR="$HOME/.claude-account1" claude auth status --json \
  | jq -e '.loggedIn == true' >/dev/null
```

On macOS, Claude Code normally stores credentials in Keychain. Allow
`quota-axi` to request one-time, profile-scoped Keychain access after each
Claude login:

```sh
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  quota-axi --provider claude --allow-keychain-prompt --no-credential-refresh
```

The `--no-credential-refresh` flag keeps these quota reads strict and
read-only. The Keychain prompt permits reading the existing profile credential;
it does not copy it into the repository.

The default and account2 profiles are not prerequisites. The verification
scripts select account1 only unless `FM_VERIFY_CODEX_PROFILES` or
`FM_VERIFY_CLAUDE_PROFILES` explicitly adds another profile.

## 8. Authenticate Pi separately

Pi does not reuse the Codex CLI or Claude Code credential stores. Start Pi:

```sh
pi
```

**Inside Pi**, enter:

```text
/login
```

Select a supported coordinator provider. The audited preferred choice was
`ChatGPT Plus/Pro (Codex)`. Complete the browser flow, then exit Pi.

Verify in the normal terminal:

```sh
pi --offline --list-models
```

The result must list at least one model. The failure text
`No models available. Use /login ...` means this step is incomplete.

See [Pi setup](pi-setup.md) for provider and Node details.

## 9. Install Herdr integrations for the active profiles

Herdr requires the Pi agent root to exist. Create only the empty directory; do
not create or copy an authentication file:

```sh
mkdir -p "$HOME/.pi/agent"
herdr integration install pi
```

Install Codex and Claude integrations into the two primary profiles:

```sh
CODEX_HOME="$HOME/.codex-account1" herdr integration install codex

CLAUDE_CONFIG_DIR="$HOME/.claude-account1" herdr integration install claude
```

Verify Pi and the selected account1 profiles without exposing paths:

```sh
cd "$HOME/src/firstmate-multi-harness"
./scripts/verify-herdr-integrations.sh
```

Expected result: Pi, Codex account1, and Claude account1 are `current`.

## 10. Install FirstMate support hooks per profile

Run each setup command for the active primary pair:

```sh
CODEX_HOME="$HOME/.codex-account1" CLAUDE_CONFIG_DIR="$HOME/.claude-account1" gh-axi setup hooks

CODEX_HOME="$HOME/.codex-account1" CLAUDE_CONFIG_DIR="$HOME/.claude-account1" chrome-devtools-axi setup hooks

CODEX_HOME="$HOME/.codex-account1" CLAUDE_CONFIG_DIR="$HOME/.claude-account1" lavish-axi setup hooks
```

`tasks-axi` and `quota-axi` are invoked directly by FirstMate and need no hook
installation step. Restart any already-running harness session after installing
hooks.

## 11. Configure FirstMate's Herdr backend and dynamic dispatch

First apply the tested account-boundary patch. Current FirstMate already
forwards `CLAUDE_CONFIG_DIR` into daemon-created Claude workers; this patch adds
the symmetric `CODEX_HOME` forwarding required for an isolated Codex profile:

```sh
git -C "$HOME/src/firstmate" apply --check \
  "$HOME/src/firstmate-multi-harness/patches/firstmate-forward-codex-home.patch"
git -C "$HOME/src/firstmate" apply \
  "$HOME/src/firstmate-multi-harness/patches/firstmate-forward-codex-home.patch"
bash -n "$HOME/src/firstmate/bin/fm-spawn.sh"
```

The patch was checked against a clean clone of audited FirstMate commit
`6c1d2db194cb20e08232ba2fa2c414592f724b44`. Its production change and set/unset
profile cases passed FirstMate's complete
`fm-spawn-dispatch-profile.test.sh` regression. If `git apply --check` fails on
a later upstream revision, stop: inspect whether upstream now forwards
`CODEX_HOME` itself rather than forcing the dated patch.

The patch leaves the FirstMate checkout with one intentional tracked change.
See [daily usage](daily-usage.md) before updating FirstMate; an upstream update
must preserve or replace this behavior.

Copy the tested local configuration into the FirstMate clone:

```sh
mkdir -p "$HOME/src/firstmate/config"
cp "$HOME/src/firstmate-multi-harness/examples/firstmate-backend" \
  "$HOME/src/firstmate/config/backend"
cp "$HOME/src/firstmate-multi-harness/examples/crew-dispatch.json" \
  "$HOME/src/firstmate/config/crew-dispatch.json"
```

Do not create `config/crew-harness`. Its absence lets the dispatch file select
Pi, Codex, or Claude and leaves Pi as the file's explicit default.

These files are local and ignored by FirstMate's own `.gitignore`.

Verify the schema and resolved facts:

```sh
cd "$HOME/src/firstmate"
FM_BOOTSTRAP_DETECT_ONLY=1 \
FM_BOOTSTRAP_NETWORK=skip \
FM_BOOTSTRAP_VERBOSE_FACTS=1 \
  bin/fm-bootstrap.sh
```

Expected output includes three `crew dispatch rule` facts and a
`crew dispatch default: pi/default/medium` fact, with no `CREW_DISPATCH:` error.

## 12. Run repository verification

From the setup repository:

```sh
cd "$HOME/src/firstmate-multi-harness"
./scripts/verify-all.sh
```

Every group must pass before the first live dispatch test. The scripts are
read-only and avoid printing identity, credential, and quota-amount fields.

Continue with [FirstMate setup](firstmate-setup.md) and [daily usage](daily-usage.md)
for the first Herdr launch and live coordinator test.
