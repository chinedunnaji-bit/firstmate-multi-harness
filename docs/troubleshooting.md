# Troubleshooting

Every entry on this page comes from a failure observed during the audited build.
The clean procedure lives in [installation](installation.md); this page preserves
the unsuccessful paths, established causes, and working fixes.

## Herdr says Pi is not installed even though `pi --version` works

### Symptom

`pi --version` succeeds, but:

```sh
herdr integration install pi
```

fails with:

```text
pi extension directory not found at <pi-agent-directory>/extensions. install pi first
```

### Why it happens

Herdr resolves Pi's agent root separately from the `pi` executable. Current
Herdr will create the `extensions` child, but it requires the agent root itself
to exist first. A globally installed Pi executable is therefore not sufficient
evidence that the directory exists.

### Diagnosis

Check the normal Pi agent root without reading any credentials:

```sh
test -d "$HOME/.pi/agent" && echo present || echo missing
```

If `PI_CODING_AGENT_DIR` is set, inspect only its directory status:

```sh
printf 'PI_CODING_AGENT_DIR is %s\n' "${PI_CODING_AGENT_DIR:+set}"
```

### Fix

For the default profile, create the empty agent root and retry:

```sh
mkdir -p "$HOME/.pi/agent"
herdr integration install pi
```

Do not create or copy an authentication file as part of this fix.

### Verify

```sh
herdr integration status
```

The audited result was:

```text
pi: current (v8)
```

## Pi still reports 0.74.2 after installing 0.84.4

### Symptom

The package installation completes, but:

```sh
pi --version
```

still prints:

```text
0.74.2
```

### Why it happens

NVM gives each Node release its own global npm prefix. The audit machine had Pi
0.74.2 below Node 20.19.5 and Pi 0.84.4 below Node 22.21.1. The selected Node
version therefore selected a different global `pi` executable.

Installed package metadata showed Pi 0.74.2 required Node 20.6 or newer while
Pi 0.84.4 required Node 22.19 or newer.

### Diagnosis

```sh
node --version
nvm current
nvm version default
npm prefix -g
command -v pi
pi --version
```

The `pi` path and npm prefix should both be below the selected Node 22 prefix.

### Fix

```sh
nvm install 22.21.1
nvm alias default 22.21.1
nvm use default
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.84.4
```

Open a fresh terminal after changing the NVM default.

### Verify

```sh
/bin/zsh -lic 'node --version; npm prefix -g; command -v pi; pi --version'
```

The audited versions were Node `v22.21.1` and Pi `0.84.4`.

## A fresh terminal finds tools that the current terminal cannot find

### Symptom

FirstMate bootstrap or a verification script reports missing AXI tools, or the
account wrappers print old Codex/Claude versions, even though the tools were
installed under the new NVM default.

### Why it happens

A terminal that was already open retained the Node 20 npm prefix on `PATH`.
Changing `nvm alias default` affects new shells; it does not rewrite the
environment of an existing process. Herdr panes and child processes inherit the
environment from the process that launched them.

### Diagnosis

Compare the current shell with a fresh login shell:

```sh
node --version
npm prefix -g
/bin/zsh -lic 'node --version; npm prefix -g'
```

### Fix

Open a new terminal, or explicitly select the default before launching Herdr or
Pi:

```sh
nvm use default
```

Restart already-running Herdr sessions if they inherited the old `PATH`.

### Verify

```sh
/bin/zsh -lic 'command -v pi codex claude quota-axi tasks-axi gh-axi \
  chrome-devtools-axi lavish-axi'
```

## `nvm exec ... pi --help` prints NVM help instead of Pi help

### Symptom

This audit command did not invoke Pi's help:

```sh
nvm exec 22.21.1 pi --help
```

NVM consumed `--help` and printed its own usage text.

### Why it happens

The flag is parsed by `nvm exec` in this command form instead of being a
reliable pass-through verification for the child CLI.

### Diagnosis

The output identifies NVM rather than Pi and does not contain Pi's option list.

### Fix

Select the version inside a fresh shell, then invoke Pi directly:

```sh
/bin/zsh -lic 'nvm use 22.21.1 --silent; pi --help'
```

### Verify

```sh
/bin/zsh -lic 'nvm use 22.21.1 --silent; pi --version'
```

## Pi lists no models

### Symptom

```sh
pi --offline --list-models
```

prints:

```text
No models available. Use /login to log into a provider via OAuth or API key.
```

The strict check also reports:

```json
{"status":"not_ready","provider":"openai-codex","reason":"credentials_not_configured"}
```

### Why it happens

Pi maintains its own provider authentication. A working Codex CLI or Claude
Code login does not authenticate Pi.

### Diagnosis

```sh
pi auth check --provider openai-codex --json --no-refresh
pi auth check --provider anthropic --json --no-refresh
```

These commands report state without starting a credential refresh.

### Fix

Start Pi interactively:

```sh
pi
```

Then enter `/login` **inside Pi**, select a supported provider, and complete its
browser flow. The audited preferred coordinator option was ChatGPT Plus/Pro
(Codex).

### Verify

```sh
pi --offline --list-models
```

Do not proceed to live FirstMate dispatch until at least one model is listed.

## Pi `/login` does not open when passed as a startup argument

### Symptom

This attempted shortcut starts Pi but does not open the login selector:

```sh
pi "/login"
```

In an isolated empty Pi profile, the useful output was:

```text
Warning: No models available. Use /login to log into a provider via OAuth or API key.
Error: No API key found for the selected model.
```

### Why it happens

Pi treats a positional startup string as an initial user message. Interactive
slash commands are interpreted only after the Pi interface is running.

### Diagnosis

`pi --help` lists initial-message arguments but no startup option that executes
`/login` as a slash command.

### Fix

Launch Pi first. Resolve its project-trust prompt and wait for the interactive
screen. Then either type `/login` inside Pi or press `/` in Account Fleet. The
Account Fleet action uses Herdr's installed `agent prompt` interface to deliver
the slash command only to an idle FirstMate Pi coordinator.

### Verify

The provider selector should appear in the coordinator tab. After completing
the provider flow, run:

```sh
pi --offline --list-models
```

At least one usable model should be listed.

## Account Fleet reports `Herdr returned an invalid response for pane run`

### Symptom

After pressing `L`, Account Fleet creates the coordinator tab but displays:

```text
Herdr returned an invalid response for pane run
```

### Why it happens

Account Fleet 0.2.0 sent the correct installed command, but reused its
JSON-response parser for every Herdr operation. Herdr 0.8.2 returns JSON objects
from topology creation commands such as `tab create`; successful `pane run` is
an input-submission operation and returns exit status 0 without a JSON body.
The original fake-Herdr test incorrectly returned an invented
`pane_command_run` object, so it did not reproduce the installed behavior.

### Diagnosis

The installed help confirms the command shape:

```sh
herdr pane run --help
```

The bundled API schema has a `tab_created` result carrying the new pane ID but
no `pane_command_run` result type. The current official CLI reference describes
`pane run` as atomically submitting command text plus Enter and promises JSON
IDs specifically for creation commands.

### Fix

Use Account Fleet 0.2.1 or newer. It still requires a successful exit status
from `pane run`, but does not require a response body for that one operation.

Because the command may already have been submitted before version 0.2.0 showed
the parser error, inspect Herdr's `firstmate-coordinator` tab before pressing
`L` again. The duplicate-coordinator guard will refuse another launch once Pi
is detected.

### Verify

```sh
./scripts/verify-account-ui.sh
herdr plugin list --plugin firstmate.account-fleet --json \
  | jq -e '.result.plugins[0].version == "0.2.1"'
```

The launch regression uses a fake `pane run` that exits successfully with
empty stdout, matching the installed behavior.

Sources: [Herdr v0.8.2 `pane run` implementation](https://github.com/herdrdev/herdr/blob/v0.8.2/src/cli/pane.rs#L989-L1002),
[Herdr v0.8.2 success-only request handler](https://github.com/herdrdev/herdr/blob/v0.8.2/src/cli.rs#L698-L708).

## Codex login status succeeds but quota is stale or unavailable

### Symptom

`codex login status` returns success for a profile, while strict `quota-axi`
output reports stale or unavailable evidence.

This was observed for the default and account2 Codex profiles; account1
returned fresh evidence.

If you do not own the optional profile, this is not a setup failure. Leave it
unselected; the verifier checks account1 only by default.

### Why it happens

A stored-login check proves that credential state exists, not that a current
quota/capacity read succeeded. FirstMate account selection must not infer live
capacity from vendor login status alone.

### Diagnosis

Select one profile and keep output local; it can contain capacity details:

```sh
CODEX_HOME="$HOME/.codex-account2" codex login status
CODEX_HOME="$HOME/.codex-account2" \
  quota-axi --provider codex --json --no-credential-refresh
```

### Fix

Reauthenticate that profile interactively:

```sh
codex2 login
```

Do not copy `auth.json` from another account.

### Verify

```sh
CODEX_HOME="$HOME/.codex-account2" \
  quota-axi --provider codex --json --no-credential-refresh
```

Require current, usable evidence before adding the profile to automatic
fallback.

## Claude default or account2 reports not authenticated

### Symptom

The audited default and account2 profiles failed:

```sh
claude auth status --json
```

with `loggedIn` false, and their strict quota checks were unavailable.

If those optional accounts do not exist, do not create empty credentials or
copy account1. Leave them out of `FM_VERIFY_CLAUDE_PROFILES`.

### Why it happens

Each `CLAUDE_CONFIG_DIR` is an independent profile. Logging into account1 does
not authenticate the default or account2 directories.

### Diagnosis

```sh
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" claude auth status --json \
  | jq '{loggedIn}'
```

This projection avoids printing identity fields.

### Fix

```sh
claude2 auth login
```

Complete the interactive login for that profile. Do not copy credential files
or Keychain material between profiles.

### Verify

```sh
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" claude auth status --json \
  | jq -e '.loggedIn == true' >/dev/null
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" \
  quota-axi --provider claude --json --allow-keychain-prompt \
  --no-credential-refresh >/dev/null
```

## Claude quota inspection needs a macOS Keychain prompt

### Symptom

The CLI profile is logged in, but a noninteractive quota check cannot read its
credential-backed capacity state.

### Why it happens

Claude Code can keep credentials in macOS Keychain. `quota-axi` needs permission
to read the account/profile-scoped entry; a sandboxed or fully noninteractive
process may not be allowed to show that prompt.

### Diagnosis

Run the strict query in a normal interactive macOS terminal:

```sh
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  quota-axi --provider claude --json --no-credential-refresh
```

### Fix

Permit the one-time prompt explicitly:

```sh
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  quota-axi --provider claude --json --allow-keychain-prompt \
  --no-credential-refresh
```

This reads the existing profile credential; it does not place it in the setup
repository.

### Verify

Repeat the same command and confirm the profile has current quota evidence.
Do not paste its full JSON into an issue or build log.

## A Herdr integration is current for account1 but missing for account2

### Symptom

`herdr integration status` reports current Codex or Claude integration under
one profile but not another.

This is a problem only when the second profile is intentionally enabled. An
absent optional account2 hook is expected in a primary-only setup.

### Why it happens

Herdr installs its hook into the selected `CODEX_HOME` or
`CLAUDE_CONFIG_DIR`. Hooks are profile-local; a current account1 hook says
nothing about account2.

### Diagnosis

```sh
CODEX_HOME="$HOME/.codex-account2" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" \
  herdr integration status
```

### Fix

```sh
CODEX_HOME="$HOME/.codex-account2" herdr integration install codex
CLAUDE_CONFIG_DIR="$HOME/.claude-account2" herdr integration install claude
```

### Verify

```sh
FM_VERIFY_CODEX_PROFILES="account1 account2" \
FM_VERIFY_CLAUDE_PROFILES="account1 account2" \
  ./scripts/verify-herdr-integrations.sh
```

## FirstMate rejects `codex1` in `crew-dispatch.json`

### Symptom

Bootstrap reports:

```text
CREW_DISPATCH: invalid config/crew-dispatch.json - unverified harness: codex1
```

### Why it happens

`codex1` is this repository's shell-level account wrapper, not a FirstMate
harness identifier. FirstMate recognizes `codex`; account selection belongs
below that harness boundary.

### Diagnosis

```sh
cd "$HOME/src/firstmate"
FM_BOOTSTRAP_DETECT_ONLY=1 \
FM_BOOTSTRAP_NETWORK=skip \
FM_BOOTSTRAP_VERBOSE_FACTS=1 \
  bin/fm-bootstrap.sh
```

### Fix

Use `"harness": "codex"` and select the profile with `CODEX_HOME`. Use
`"harness": "claude"` and `CLAUDE_CONFIG_DIR` for Claude. Do not invent new
harness identifiers for account names.

### Verify

Rerun bootstrap. It should report active dispatch facts and no
`CREW_DISPATCH:` error.

## FirstMate rejects malformed dispatch JSON

### Symptom

```text
CREW_DISPATCH: invalid config/crew-dispatch.json - malformed JSON
```

### Why it happens

The dispatch file is parsed and schema-validated before workers are spawned.
Current FirstMate fails closed rather than silently bypassing an invalid
profile.

### Diagnosis

```sh
jq empty "$HOME/src/firstmate/config/crew-dispatch.json"
```

Then run the FirstMate bootstrap command shown in the previous entry to catch
schema errors that valid JSON alone cannot detect.

### Fix

Replace the file with the tested example:

```sh
cp examples/crew-dispatch.json \
  "$HOME/src/firstmate/config/crew-dispatch.json"
```

Run that command from this setup repository. Keep `config/crew-harness` absent.

### Verify

```sh
FIRSTMATE_REPO="$HOME/src/firstmate" ./scripts/verify-firstmate.sh
```

## Codex workers ignore the coordinator's `CODEX_HOME`

### Symptom

The Pi coordinator is launched with:

```sh
CODEX_HOME="$HOME/.codex-account1" pi
```

but that alone does not prove a Codex worker created through the long-lived
Herdr daemon uses account1.

### Why it happens

At audited FirstMate commit
`6c1d2db194cb20e08232ba2fa2c414592f724b44`, `fm-spawn.sh` explicitly forwarded
`CLAUDE_CONFIG_DIR` for Claude but did not add the symmetric `CODEX_HOME` prefix
to Codex worker launch commands.

### Diagnosis

Run this repository's verifier against the clone:

```sh
FIRSTMATE_REPO="$HOME/src/firstmate" ./scripts/verify-firstmate.sh
```

It checks for the tested production change without displaying profile content.

### Fix

For the audited commit, apply the repository patch:

```sh
git -C "$HOME/src/firstmate" apply --check \
  "$HOME/src/firstmate-multi-harness/patches/firstmate-forward-codex-home.patch"
git -C "$HOME/src/firstmate" apply \
  "$HOME/src/firstmate-multi-harness/patches/firstmate-forward-codex-home.patch"
bash -n "$HOME/src/firstmate/bin/fm-spawn.sh"
```

Run those patch commands from this setup repository. The patch adds both
production behavior and regression cases for a set and unset `CODEX_HOME`.

If `git apply --check` fails after a FirstMate update, inspect upstream first:
it may already implement equivalent forwarding. Do not force-apply a dated
patch.

### Verify

```sh
cd "$HOME/src/firstmate"
bin/fm-test-run.sh tests/fm-spawn-dispatch-profile.test.sh
```

The audited run passed the full file, including both new Codex profile cases.

## FirstMate bootstrap cannot see newly installed tools

### Symptom

`fm-bootstrap.sh` reports a tool missing even though a fresh terminal resolves
it.

### Why it happens

The observed cause was a long-lived shell still using the old NVM prefix, not a
FirstMate dependency detector defect.

### Diagnosis

```sh
command -v quota-axi tasks-axi gh-axi chrome-devtools-axi lavish-axi
/bin/zsh -lic 'command -v quota-axi tasks-axi gh-axi \
  chrome-devtools-axi lavish-axi'
```

### Fix

Launch FirstMate and Herdr from a fresh shell after `nvm use default`.

### Verify

```sh
cd "$HOME/src/firstmate"
FM_BOOTSTRAP_DETECT_ONLY=1 FM_BOOTSTRAP_NETWORK=skip bin/fm-bootstrap.sh
```

The audited working run exited successfully without output.

## A FirstMate regression test fails only inside a restricted sandbox

### Symptom

The direct spawn-profile regression failed while its PID identity helper was
blocked in a restricted execution environment. Running the official test runner
in a normal terminal completed successfully.

### Why it happens

The test exercises daemon/pane process identity behavior. A sandbox can deny
the process inspection needed by that helper even when the production code is
correct.

### Diagnosis

Do not hide the first failure. Confirm whether its output identifies permission
or process-inspection restrictions, then rerun the same repository test outside
that sandbox.

### Fix

No system install change was required in the audited case. Run:

```sh
cd "$HOME/src/firstmate"
bin/fm-test-run.sh tests/fm-spawn-dispatch-profile.test.sh
```

from a normal terminal with the user's ordinary process permissions.

### Verify

The audited result was exit status `0` with every test in the file passing.

## Publication check reports trailing whitespace inside the patch artifact

### Symptom

The first staged two-file patch applied successfully to FirstMate, but the
setup repository's publication gate failed:

```text
patches/firstmate-forward-codex-home.patch:41: trailing whitespace.
patches/firstmate-forward-codex-home.patch:83: trailing whitespace.
```

### Why it happens

Those lines were blank context lines in the nested unified diff. A context line
contains a single leading space as a patch marker; when the patch is itself a
tracked file, the outer repository's `git diff --check` interprets that marker
as trailing whitespace.

### Diagnosis

```sh
git diff --check
git diff --cached --check
grep -n '[[:blank:]]$' patches/firstmate-forward-codex-home.patch
```

### Fix

The published patch uses smaller hunks with nonblank context and no whitespace-
only context lines. Do not blindly strip patch markers: that can corrupt a
unified diff. Regenerate or restructure the hunks, then reapply the artifact to
a clean FirstMate clone.

### Verify

```sh
git diff --check
git diff --cached --check
git -C "$HOME/src/firstmate" apply --check \
  "$HOME/src/firstmate-multi-harness/patches/firstmate-forward-codex-home.patch"
```

The corrected artifact applied to the audited FirstMate commit, produced files
identical to the already-tested tree, and passed the full reverse/reapply
lifecycle.

## Account Fleet exits after adding a planned profile

### Symptom

An early Account Fleet build accepted the provider and account number, rendered
the new `planned` row, and then exited with:

```text
Warning: Detected unsettled top-level await
if (!runCommandLine(process.argv.slice(2))) await interactive();
```

### Why it happens

The first implementation temporarily switched from raw key input to a Node
`readline` prompt. Closing that prompt paused standard input. The next UI key
read waited on a paused stream with no active event-loop handle, so Node ended
the process and reported the unresolved top-level await.

### Diagnosis

Use a disposable registry so the reproduction cannot change live routing:

```sh
account_fleet_test_dir=$(mktemp -d)
FM_ACCOUNT_FLEET_CONFIG="$account_fleet_test_dir/accounts.json" \
  node plugins/account-fleet/account-fleet.mjs
```

Press `n`, enter a provider and account number, and confirm whether the planned
row remains interactive.

### Fix

The shipped prompt cleanup explicitly resumes standard input before restoring
raw mode. Update this setup repository. A locally linked Herdr plugin uses the
updated working tree immediately; a GitHub-managed plugin must be reinstalled
using Herdr's documented plugin install flow.

### Verify

```sh
node --test tests/account-fleet.test.mjs
```

The fixed implementation was also exercised in an isolated PTY: `n`,
`claude`, `2` rendered `claude account2` as planned, the UI remained active,
and `q` exited cleanly.

## Anthropic login succeeds in Pi but the first message returns an extra-usage error

### Symptom

Pi reports that Anthropic credentials were saved, but the first model request
fails with:

```text
Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Third-party apps now draw from your extra usage, not your plan limits. Add more at claude.ai/settings/usage and keep going."}}
```

### Why it happens

The installed Pi provider guide states that Claude Pro/Max authentication is
supported, but Pi is a third-party harness. Its requests draw from Anthropic
extra usage billed per token rather than ordinary Claude subscription limits.
Saving the OAuth credential proves authentication, not available billable
capacity.

Claude Code is a separate harness with its own `CLAUDE_CONFIG_DIR`; its normal
subscription behavior should not be inferred from a Pi request.

### Diagnosis

From a normal terminal, use Pi's non-refreshing authentication check:

```sh
pi auth check --provider anthropic --json --no-refresh
```

Do not inspect or print `$HOME/.pi/agent/auth.json`.

### Fix

For this repository's preferred coordinator route, enter `/login` inside Pi and
select `ChatGPT Plus/Pro (Codex)`. Then use `/model` to select GPT-5.6 Sol and
`/thinking` to select `xhigh`. Press `Ctrl+S` in each picker to save the startup
default.

Alternatively, explicitly fund Anthropic extra usage if third-party Pi billing
is intended. For Claude subscription work, route the task to the `claude`
harness so Claude Code uses the selected account profile.

### Verify

Inside Pi, send a harmless message and confirm it answers. `/session` can be
used to inspect the current session selection without opening an authentication
file. The observed post-change session answered and displayed:

```text
Thinking level: xhigh
```

That transcript proves a responding model and the thinking level; it does not,
by itself, prove the model ID unless `/session` or the Pi footer displays it.

## Computer Projects discovery returns thousands of nested source directories

### Symptom

The first whole-home discovery implementation returned:

```text
projectCount: 11046
non-git-candidate: 7627
reference: 3344
```

The result was not sent to FirstMate or accepted as a usable project map.

### Why it happens

The initial non-Git heuristic treated every directory containing two source
files as an independent project. Extracted source trees and reference
collections therefore produced thousands of nested false positives.

### Diagnosis

Run a normal scan and inspect only its sanitized counts:

```sh
plugin_root="$HOME/src/firstmate-multi-harness/plugins/account-fleet"
node "$plugin_root/project-fleet.mjs" --scan
```

### Fix

Use the current scanner. Once it recognizes a non-Git project root, it
suppresses nested non-Git matches. Source-file-only detection is depth-bounded,
and vendor/reference trees contribute only real Git roots.

The first corrected scan found 99 rows rather than 11,046. A later
canonical-root refinement also collapsed generated worktree and reference
collections and stopped descending after finding a project root. On the audit
machine its final scan produced 151 private catalog rows, of which 109 were
actionable Git or non-Git candidates; machine-specific counts change as local
projects change.

### Verify

```sh
./scripts/verify-account-ui.sh
node "$plugin_root/project-fleet.mjs" --summary
```

The deterministic suite must pass. Machine-specific counts will vary, so review
the classifications instead of treating 99 as a universal expected value.
