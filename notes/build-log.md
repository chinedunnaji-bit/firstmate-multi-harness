# Build log

This is the chronological record used to derive the clean installation path.
Paths are sanitized, quota amounts and account identities are omitted, and no
credential files were read or copied.

## 2026-08-31

### Initial environment audit

Goal: inspect the existing machine before changing it.

Observed baseline:

```text
macOS 26.3 arm64
Node v20.19.5 via NVM
npm 10.8.2
Pi 0.74.2
Herdr 0.8.2
Codex CLI 0.147.0
Claude Code 2.1.154
GitHub CLI 2.83.2
jq 1.8.1
```

Initially absent from `PATH`: Treehouse, `quota-axi`, `tasks-axi`, `gh-axi`,
`chrome-devtools-axi`, `lavish-axi`, and No Mistakes. FirstMate was not present
as a local clone. FirstMate has no standalone `firstmate` executable; its clone,
`AGENTS.md`, scripts, skills, state, and conventions are the orchestration layer.

Existing profile directories were detected without opening authentication files:

```text
$HOME/.codex
$HOME/.codex-account1
$HOME/.codex-account2
$HOME/.claude
$HOME/.claude-account1
$HOME/.claude-account2
```

Existing executable wrappers under `$HOME/.local/bin` were inspected. They use
only `$HOME`, set `CODEX_HOME` or `CLAUDE_CONFIG_DIR`, preserve arguments with
`"$@"`, and contain no token/key/secret patterns.

### NVM and Pi version selection

Goal: establish why the old Pi release was selected and what current Pi needs.

Installed package metadata and npm registry metadata showed:

```text
Pi 0.74.2  engine >=20.6.0   Node v20.19.5 prefix
Pi 0.84.4  engine >=22.19.0  Node v22.21.1 prefix
```

Verification:

```sh
for node_version in 20.19.5 22.21.1; do
  nvm use "$node_version" --silent
  pi_path=$(command -v pi)
  pi_version=$(pi --version 2>&1)
  printf 'node=%s pi=%s path=%s\n' \
    "$(node --version)" "$pi_version" "${pi_path/#$HOME/\$HOME}"
done
nvm use default --silent
```

Actual result:

```text
node=v20.19.5 pi=0.74.2 path=$HOME/.nvm/versions/node/v20.19.5/bin/pi
node=v22.21.1 pi=0.84.4 path=$HOME/.nvm/versions/node/v22.21.1/bin/pi
```

Root cause: NVM keeps global npm packages inside each Node version's prefix.
Changing Node versions changes which globally installed `pi`, `codex`, `claude`,
and AXI binaries appear on `PATH`.

Resolution: Node v22.21.1 was installed alongside Node v20.19.5 and made the NVM
default. Node 20 was retained and remains selectable.

Commands:

```sh
nvm install 22.21.1
nvm alias default 22.21.1
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

Verification in a fresh Zsh login shell:

```sh
/bin/zsh -lic 'printf "node=%s\ndefault=%s\nprefix=%s\n" \
  "$(node --version)" "$(nvm version default)" "$(npm prefix -g)"'
```

Actual result, with the prefix sanitized:

```text
node=v22.21.1
default=v22.21.1
prefix=$HOME/.nvm/versions/node/v22.21.1
```

An audit attempt using `nvm exec 22.21.1 pi --help` did not test Pi: NVM consumed
the `--help` flag and printed its own help. The working verification is:

```sh
/bin/zsh -lic 'nvm use 22.21.1 --silent; pi --help'
```

### Current tool snapshot

Verified after the Node default change:

```text
git 2.50.1 (Apple Git-155)
gh 2.83.2
jq 1.8.1
node 22.21.1
npm 10.9.4
pi 0.84.4
herdr 0.8.2
treehouse 2.3.0
codex-cli 0.151.0
Claude Code 2.1.252
quota-axi 0.1.34
tasks-axi 0.2.5
gh-axi 0.1.35
chrome-devtools-axi 0.1.33
lavish-axi 0.1.63
no-mistakes 1.60.2
```

The FirstMate bootstrap floors at the audited upstream commit were lower than
the installed versions: No Mistakes 1.46.0, `gh-axi` 0.1.29, `lavish-axi`
0.1.46, `tasks-axi` 0.2.4, and `quota-axi` 0.1.29. Treehouse is feature-probed
for `get --lease`; installed Treehouse 2.3.0 advertises that flag. FirstMate's
Herdr presentation-space floor is 0.8.0.

### Treehouse and No Mistakes

Treehouse 2.3.0 and No Mistakes 1.60.2 were installed with their official
installers. Verification:

```sh
treehouse --version
treehouse get --help
no-mistakes --version
no-mistakes axi --help
```

`treehouse get --help` confirms durable non-interactive `--lease` support.

### Herdr Pi integration: reproduced failure and fix

Goal: independently verify the previously reported missing-directory failure
without disturbing the working Pi profile.

Failure reproduction against a disposable path:

```sh
audit_root=$(mktemp -d /private/tmp/herdr-pi-missing.XXXXXX)
PI_CODING_AGENT_DIR="$audit_root/missing-agent" \
  herdr integration install pi
```

Actual error:

```text
pi extension directory not found at <temporary-directory>/missing-agent/extensions. install pi first
```

Exit status: `1`.

Root cause: current Herdr requires the resolved Pi agent directory to exist. It
will create the `extensions` child, but it will not invent the Pi agent root.

Working resolution, again in a disposable path:

```sh
audit_root=$(mktemp -d /private/tmp/herdr-pi-parent.XXXXXX)
mkdir -p "$audit_root/agent"
PI_CODING_AGENT_DIR="$audit_root/agent" herdr integration install pi
PI_CODING_AGENT_DIR="$audit_root/agent" herdr integration status
```

Actual result:

```text
installed pi integration to <temporary-directory>/agent/extensions/herdr-agent-state.ts
pi: current (v8) (<temporary-directory>/agent/extensions/herdr-agent-state.ts)
```

The real default Pi integration also reports `pi: current (v8)`.

### Herdr integrations for isolated account profiles

Goal: ensure each Codex and Claude profile receives its own Herdr hook.

Commands were run for the default, account1, and account2 directories:

```sh
CODEX_HOME="$HOME/.codex-account1" herdr integration install codex
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" herdr integration install claude
```

The equivalent commands were run for `$HOME/.codex`,
`$HOME/.codex-account2`, `$HOME/.claude`, and `$HOME/.claude-account2`.

Verification:

```sh
CODEX_HOME="$HOME/.codex-account1" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  herdr integration status
```

All three profile pairings report Pi, their selected Codex directory, and their
selected Claude directory as `current (v8)`.

### AXI hooks

Goal: make the FirstMate support tools visible to all account profiles.

The following was run for each Codex/Claude profile pairing:

```sh
CODEX_HOME="$HOME/.codex-account1" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  gh-axi setup hooks
CODEX_HOME="$HOME/.codex-account1" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  chrome-devtools-axi setup hooks
CODEX_HOME="$HOME/.codex-account1" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  lavish-axi setup hooks
```

Actual result: each setup command reported its supported Claude/Codex hook as
installed. `tasks-axi` and `quota-axi` are called directly by FirstMate and do
not require this hook step.

### FirstMate source and bootstrap

The official repository was cloned to a disposable audit directory at commit:

```text
6c1d2db194cb20e08232ba2fa2c414592f724b44
fix: surface comments on Lavish annotations (#3371)
```

Local, network-skipping bootstrap verification:

```sh
FM_BOOTSTRAP_DETECT_ONLY=1 FM_BOOTSTRAP_NETWORK=skip bin/fm-bootstrap.sh
```

Actual result: silent success after the required tools were installed. Running
the same command from a fresh login shell was important because a long-lived
shell still had the old Node 20 prefix on `PATH`.

### FirstMate dynamic dispatch

Verified harness identifiers include `pi`, `codex`, and `claude`. Names such as
`codex1` or `claude1` are not verified harness identifiers and are rejected.

Verified precedence:

1. explicit captain per-task override;
2. best-fit natural-language rule in `config/crew-dispatch.json`;
3. the file's top-level `default`;
4. static `config/crew-harness`;
5. the coordinator's harness when no static override is present.

`config/crew-harness` remains a bare static adapter. It is intentionally absent
from the planned configuration.

The model-free profile below was written only to the disposable FirstMate clone:

```json
{
  "rules": [
    {
      "when": "The task is repository implementation, debugging, test repair, or a multi-file refactor.",
      "use": { "harness": "codex", "effort": "high" }
    },
    {
      "when": "The task is architecture review, adversarial code review, or long-form technical writing.",
      "use": { "harness": "claude", "effort": "high" }
    },
    {
      "when": "The task is coordination, triage, bounded research, or documentation synthesis.",
      "use": { "harness": "pi", "effort": "medium" }
    }
  ],
  "default": { "harness": "pi", "effort": "medium" }
}
```

Verification:

```sh
FM_BOOTSTRAP_DETECT_ONLY=1 \
FM_BOOTSTRAP_NETWORK=skip \
FM_BOOTSTRAP_VERBOSE_FACTS=1 \
  bin/fm-bootstrap.sh
```

Actual result: all three rules and the Pi default were reported as active with
no `CREW_DISPATCH` error. Models are omitted deliberately until each harness's
authenticated model catalog is verified.

Negative checks also confirmed fail-closed behavior:

```text
CREW_DISPATCH: invalid config/crew-dispatch.json - malformed JSON
CREW_DISPATCH: invalid config/crew-dispatch.json - unverified harness: codex1
```

When a dispatch file exists, `fm-spawn.sh` refuses a crewmate/scout spawn that
does not carry the concrete harness FirstMate resolved. The shell does not parse
the natural-language rules; the coordinator does.

### Account-scoped quota evidence

Goal: establish whether `quota-axi` isolates profiles through the two vendor
configuration environment variables.

Strict read-only command shape:

```sh
CODEX_HOME="$HOME/.codex-account1" \
  quota-axi --provider codex --json --no-credential-refresh
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  quota-axi --provider claude --json \
  --allow-keychain-prompt --no-credential-refresh
```

Actual sanitized result:

- `codex1`: fresh quota state, known all-model availability, selection priority present.
- `claude1`: fresh quota state, known all-model availability.
- default Codex and `codex2`: stale/unavailable quota evidence despite the vendor
  CLI reporting a stored login; re-authentication is required.
- default Claude and `claude2`: not authenticated according to the vendor CLI.

Conclusion: account-scoped reads work. FirstMate quota-array dispatch chooses
among harness/provider profiles, not among shell account aliases. A custom
account router must query each profile separately beneath the recognized
`codex` or `claude` harness. Automatic account fallback is not yet end-to-end
verified because only one account per provider is currently usable.

### Pi coordinator authentication blocker

Command:

```sh
pi --offline --list-models
```

Actual result:

```text
No models available. Use /login to log into a provider via OAuth or API key.
```

Strict provider checks:

```sh
pi auth check --provider openai-codex --json --no-refresh
pi auth check --provider anthropic --json --no-refresh
```

Actual sanitized results:

```json
{"status":"not_ready","provider":"openai-codex","reason":"credentials_not_configured"}
{"status":"not_ready","provider":"anthropic","reason":"credentials_not_configured"}
```

This is independent of the Codex CLI and Claude Code profile logins. Pi stores
its own provider credentials under its own agent directory. The user must start
Pi interactively, run `/login`, and select a coordinator provider before a live
FirstMate coordinator/worker dispatch can be tested.

### GitHub publication preflight

`gh auth status` returned exit status 0. The active account name and token lines
were filtered from the audit output. No repository has been created because the
public repository name is still awaiting a user decision.

### Executable account-wrapper verification

Goal: prove the automation boundary does not depend on interactive Zsh aliases
or functions.

The existing wrappers were compared with the generic examples. Each wrapper:

- uses `#!/usr/bin/env bash` and `set -euo pipefail`;
- selects only `$HOME/.codex-accountN` or `$HOME/.claude-accountN`;
- delegates with `exec <harness> "$@"`;
- contains no machine username or credential value.

Verification in a fresh Node 22 login shell:

```sh
/bin/zsh -lic 'codex1 --version; codex2 --version; \
  claude1 --version; claude2 --version'
```

Actual result:

```text
codex-cli 0.151.0
codex-cli 0.151.0
2.1.252 (Claude Code)
2.1.252 (Claude Code)
```

The same wrappers invoked from the still-open Node 20 audit shell selected its
older global harness versions. The wrappers correctly preserve `PATH`; they do
not override NVM. This established the fresh-shell requirement in the clean
path.

### FirstMate Codex account-boundary gap

Goal: verify that a profile selected on the Pi coordinator reaches workers
created through the long-lived Herdr daemon.

Source inspection and existing regression tests showed that audited FirstMate
explicitly prefixes Claude worker launches with `CLAUDE_CONFIG_DIR` when it is
set. Codex worker launches did not have a corresponding `CODEX_HOME` prefix.

Root cause: shell functions such as `codex1` are not FirstMate harness
identifiers, and daemon-created workers cannot rely on the coordinator's
interactive shell functions. The recognized harness remains `codex`, so the
profile selector must cross that worker-launch boundary as an environment
value.

A minimal patch was made in the disposable FirstMate clone:

```sh
if [ "$HARNESS" = codex ] && [ -n "${CODEX_HOME:-}" ]; then
  LAUNCH="CODEX_HOME=$(shell_quote "$CODEX_HOME") $LAUNCH"
fi
```

Set and unset regression cases were added to the upstream dispatch-profile test
file. The first direct test attempt failed when a restricted sandbox blocked
the test's process-identity helper. The authoritative rerun used FirstMate's
official runner in a normal process-permission context:

```sh
bin/fm-test-run.sh tests/fm-spawn-dispatch-profile.test.sh
```

Actual result:

```text
exit status 0
all tests passed
duration 84.319 seconds
codex forwards firstmate's CODEX_HOME: passed
codex omits the home prefix when CODEX_HOME is unset: passed
```

The resulting repository patch was checked against a separate clean clone of
commit `6c1d2db194cb20e08232ba2fa2c414592f724b44` using `git apply --check`,
`bash -n`, and `git diff --check`.

The documented update lifecycle was also exercised against another disposable
clone:

```text
apply -> reverse --check -> reverse -> apply --check -> apply
patch_lifecycle=PASS
```

This patch is a tested custom addition, not an upstream feature claim.

### Read-only verification scripts

The staged repository now contains focused checks for prerequisites, harness
authentication/quota state, Herdr integrations, FirstMate local configuration,
and the combined stack.

Fresh-login prerequisite result:

```text
0 failures, 0 warnings
```

Herdr integration result:

```text
Pi current
Codex current in default, account1, and account2
Claude current in default, account1, and account2
0 failures
```

FirstMate configuration result against the disposable audit clone:

```text
instruction/bootstrap surfaces present
fm-spawn.sh syntax valid
CODEX_HOME forwarding present
backend herdr
crew-harness absent
dispatch limited to pi/codex/claude
diff check clean
0 failures
```

The harness verifier intentionally failed seven current-state checks:

```text
Pi model catalog unavailable: 1
Codex default/account2 strict quota unavailable: 2
Claude default/account2 vendor login unavailable: 2
Claude default/account2 strict quota unavailable: 2
```

The two account1 profiles passed. These failures are setup work still required;
the verifier did not modify credentials or print identities and quota amounts.

### Documentation staging

The clean installation path, architecture, component pages, dynamic routing,
multi-account boundary, daily operation, security guide, real-failure
troubleshooting, generic wrappers, tested patch, and verification scripts were
assembled in a sanitized temporary tree.

At this point the temporary tree was not the public repository. Its README
deliberately kept repository-name and owner placeholders until the user chose
one of the proposed names. No Git repository or remote was created for the
staging tree.

## 2026-09-01

### Patch-artifact consistency correction

A repository-wide review found that the first staged patch artifact contained
the production `fm-spawn.sh` change but omitted the two test-file hunks that had
been exercised in the disposable audit clone. This contradicted the
troubleshooting text that said the published patch carried both production and
regression changes.

Resolution: the exact already-tested set/unset regression hunks were added to
`patches/firstmate-forward-codex-home.patch`. The corrected artifact was applied
to a new clean clone of the audited FirstMate commit. Both changed shell files
passed `bash -n`, and `git diff --check` passed.

The official focused test was then run from that new clone:

```sh
bin/fm-test-run.sh tests/fm-spawn-dispatch-profile.test.sh
```

Actual result:

```text
exit status 0
all tests passed
duration 86.773 seconds
codex forwards firstmate's CODEX_HOME: passed
codex omits the home prefix when CODEX_HOME is unset: passed
```

The full two-file artifact also passed:

```text
apply -> reverse --check -> reverse -> apply --check -> apply
full_patch_lifecycle=PASS
```

### Pin the reproducible FirstMate revision

A documentation consistency review found that the clean path cloned FirstMate's
moving default branch and only recorded its revision afterward. That was not
sufficiently reproducible for a local patch and dispatch contract tested at one
specific commit.

Resolution: the clean clone sequence now detaches at:

```text
6c1d2db194cb20e08232ba2fa2c414592f724b44
```

The checkout command and revision assertion were executed against a fresh
disposable clone and passed. `verify-firstmate.sh` now fails if `HEAD` differs
from that audited commit, preventing a later upstream revision from being
silently described as verified. The daily update procedure explicitly switches
back to `main` after reversing the local patch and labels the new revision
unverified until the setup repository is re-audited.

### Publication-gate dry run

The first disposable Git staging run correctly failed because repository name
and owner placeholders remained. After replacing them with nonpersonal test
values in a second disposable copy, `git diff --check` found another real
failure:

```text
patches/firstmate-forward-codex-home.patch:41: trailing whitespace.
patches/firstmate-forward-codex-home.patch:83: trailing whitespace.
```

Root cause: the tracked patch file contained two unified-diff blank context
lines represented by a single space. The patch was restructured with smaller,
nonblank context while retaining the same production and test changes.

Verification:

```text
clean-clone git apply --check: passed
changed files byte-identical to the regression-tested tree: passed
Bash syntax and FirstMate diff check: passed
patch-file trailing-whitespace grep: no matches
```

The publication gate was then rerun in another disposable repository with test
name/owner values. It completed with `0 failure(s)` and only the expected manual
review notices for staged changes and generic security terminology.

### Complete verifier rerun

The final read-only `verify-all.sh` rerun from a fresh Node 22 login shell
reported:

```text
prerequisites: pass
harnesses: fail (7 known interactive-auth/quota checks)
Herdr integrations: pass
FirstMate pinned revision/config/bootstrap: pass
overall: 1 verification group failed
```

The seven harness failures remain exactly the previously recorded Pi model,
Codex default/account2 quota, and Claude default/account2 auth/quota items. No
new regression was introduced by the documentation and verifier changes.

### Prerequisite-verifier hardening

The prerequisite check was extended to enforce the exact pinned Node/npm
toolset and feature-probe Treehouse `get --lease` plus the No Mistakes AXI
surface.

The first Treehouse probe incorrectly failed even though installed help listed
`--lease`. The script used `treehouse get --help | grep -q` under `pipefail`;
after `grep -q` found the flag and exited, the help producer could observe the
closed pipe and make the pipeline nonzero.

Resolution: capture the complete help output and status first, then search the
captured value without a producer pipeline.

Verification in a fresh login shell:

```text
all ten pinned Node/npm version checks passed
Treehouse get --lease feature probe passed
No Mistakes AXI feature probe passed
0 failures, 0 warnings
```

### Final static and security dry run before naming

The complete staged tree passed:

```text
Bash syntax for every verification script and wrapper
crew-dispatch JSON parsing
Markdown fence balance
all relative Markdown link targets
personal-path and local-username scan
repository-wide trailing-whitespace scan
unfinished-marker scan
.gitignore credential/profile test cases
```

A disposable Git copy was given nonpersonal test owner/repository values and
run through `scripts/check-publication.sh`. Result:

```text
0 failures, 2 review items
```

The two review items are intentional: the dry run has staged changes and the
security documentation contains generic credential-related terminology. Both
must still be manually inspected before the real public push.

### Repository name selection and local initialization

Goal: materialize the sanitized staging tree under the selected public name
without creating a GitHub remote before live verification.

Selected name:

```text
firstmate-multi-harness
```

The GitHub CLI supplied the authenticated public owner for documentation URL
replacement. Only the public login name was used; no token or credential output
was recorded.

Command shape, with the local parent sanitized:

```sh
target="$HOME/<workspace>/firstmate-multi-harness"
mkdir -p "$target"
cp -R <sanitized-staging-tree>/. "$target/"
git -C "$target" init -b main
```

Expected behavior: copy all 28 reviewed files, replace publication placeholders,
and create an empty local Git repository on `main`.

Actual result:

```text
repository_initialized=PASS
```

Verification:

```sh
git branch --show-current
git status --short
name_marker='<repository''-name>'
owner_marker='<github''-owner>'
git grep -nE "$name_marker|$owner_marker" -- . \
  ':!scripts/check-publication.sh'
```

The branch is `main`; all intended repository files are initially untracked;
and no publication placeholders remain outside the checker that detects them.
No GitHub repository or remote has been created yet.

### Initial milestone commits

The reviewed tree was committed in five logical milestones:

```text
docs: document audited architecture and prerequisites
feat: add multi-harness and account routing examples
feat: preserve isolated Codex profiles in FirstMate workers
feat: add read-only stack verification
docs: complete reproducible installation and operations guide
```

Each staged milestone passed `git diff --cached --check` and the high-confidence
secret-pattern scan before commit. The resulting worktree was clean, all local
Markdown links and shell syntax passed, and `check-publication.sh` reported:

```text
0 failures, 1 review item
```

The review item was the expected generic security terminology list.

### Optional-account clarification

The user clarified that there are currently no usable Codex account2 or Claude
account2 subscriptions and that those accounts may be added later.

Goal: make one account per provider sufficient while retaining a reproducible
path for adding and removing future profiles.

Root cause of the previous seven harness failures: the verifier hard-coded
default, account1, and account2 for both providers. Existing directories,
wrappers, stored-login status, and Herdr hooks proved local state existed; they
did not prove that the user currently owned or intended to activate every slot.

Resolution:

```text
FM_VERIFY_CODEX_PROFILES defaults to account1
FM_VERIFY_CLAUDE_PROFILES defaults to account1
default and positive accountN labels can be selected independently
```

The Herdr verifier was changed from three fixed provider pairs to Pi plus two
independent provider lists. The harness verifier now checks wrappers only for
selected numbered profiles.

Primary-only verification initially reported Pi login plus stale Claude1 quota
evidence. A normal-terminal, profile-scoped `quota-axi` read with the documented
one-time Keychain permission returned only these sanitized fields:

```text
provider=claude status=fresh stale=false reason=null
```

The immediate rerun then reported:

```text
Codex account1 auth/quota: pass
Claude account1 auth/quota: pass
selected Herdr integrations: pass
Pi coordinator model: the only remaining failure
```

An independent-list negative test selected Codex account1 plus account2 while
leaving Claude on account1. Codex account2's stale quota failed as expected;
Claude account1 remained successful; and the selected Herdr integrations all
passed. This proved provider counts are not coupled.

### Scalable wrappers and retirement evidence

Generic basename-driven wrappers were added for account3 and later. Disposable
fake-harness tests installed them as `codex3` and `claude4` and proved:

```text
matching account directory selected: passed
three arguments with spaces and a literal wildcard preserved: passed
non-numbered wrapper name rejected with exit status 2: passed
```

Installed help verified:

```text
codex logout                 Remove stored authentication credentials
claude auth logout           Log out from the Anthropic account
herdr integration uninstall  Supports codex and claude targets
```

Official OpenAI documentation independently states that `codex logout` clears
the selected stored credentials and that file-backed credentials live under
`CODEX_HOME`.

The documented wrapper disable/reactivate and profile archive sequence was
exercised entirely in a disposable directory:

```text
chmod 0644 -> non-executable: passed
chmod 0755 -> executable: passed
move active profile to unused .retired path: passed
active path absent and archive present: passed
```

No real account was logged out, moved, or deleted during these tests.

### Primary-only full-stack verification

The complete revised verifier was run from a fresh Node 22 login shell with the
audited FirstMate clone selected. Actual result:

```text
prerequisites: pass
Codex account1 auth/quota: pass
Claude account1 auth/quota: pass
Pi coordinator model: fail, /login still required
selected Herdr integrations: pass
FirstMate pinned revision/config/bootstrap: pass
overall: one verification group failed
```

An invalid label test supplied `accountx`; the Herdr verifier rejected it with
an actionable `use default or accountN` diagnostic and a nonzero exit status.
This prevents a typo from silently selecting an unintended directory.

## 2026-09-01

### Account-management visual surface

Goal: provide a UI for adding, checking, promoting, retiring, and later removing
optional Codex/Claude routing profiles without exposing credentials.

Initial inspection found that FirstMate's `fm-fleet-view.sh` is a terminal
renderer over a stable JSON fleet snapshot. It reports tasks and workers but has
no account-administration surface. Herdr's general help describes its terminal
workspace UI and socket API but does not list plugin commands in the top-level
common-command summary.

Direct installed help established the supported extension surface:

```sh
herdr plugin --help
herdr plugin link --help
herdr plugin pane open --help
```

Actual relevant result on Herdr 0.8.2:

```text
plugin link <PATH>
plugin pane open --plugin <ID> --entrypoint <ID>
placement values include overlay, split, tab, and zoomed
```

Herdr's versioned official plugin documentation additionally establishes that
plugin v1 runs normal out-of-process commands with the user's permissions,
supports manifest-declared terminal panes, and does not support native
non-terminal plugin UI. Resolution: build Account Fleet as a Herdr terminal
overlay rather than patching Herdr's sidebar or adding a browser credential
service.

### Account Fleet safety model

The implemented registry contains only provider, local `accountN` label,
`planned`/`active`/`retired` state, and primary selection. A new account begins
as planned. Enabling requires five Boolean checks: wrapper, profile directory,
vendor login status, current Herdr integration, and fresh strict quota evidence.

The UI's retire and forget operations change registry metadata only. They do
not run vendor logout, uninstall hooks, move directories, or delete files. The
existing account-lifecycle guide remains the explicit credential cleanup path.

Commands and checks implemented:

```sh
node plugins/account-fleet/account-fleet.mjs --help
node --test tests/account-fleet.test.mjs
bash -n scripts/launch-firstmate.sh scripts/verify-account-ui.sh
```

Actual deterministic test result before linking the plugin:

```text
6 tests, 6 passed, 0 failed
```

The fixtures deliberately emitted a fake account identity and a fake raw quota
field. The sanitized snapshot test proved neither value nor the field name was
retained. A disposable launcher fixture proved that primary selections changed
the `CODEX_HOME` and `CLAUDE_CONFIG_DIR` passed to Pi while preserving its
argument and FirstMate working directory.

Herdr accepted the manifest through the installed command (the audit clone
location is sanitized here):

```sh
herdr plugin link \
  "$HOME/<workspace>/firstmate-multi-harness/plugins/account-fleet" \
  --enabled
```

The returned registration identified plugin `firstmate.account-fleet`, pane
`accounts`, and placement `overlay`. The Account Fleet executable was then run
in an isolated PTY with a temporary registry; it rendered the two primary
account1 rows and exited cleanly on `q`.

The first interactive add-profile PTY test exposed a real input-loop bug. After
entering `codex` and `2`, the row rendered and Node exited with:

```text
Warning: Detected unsettled top-level await
```

Root cause: closing the temporary `readline` interface paused standard input,
leaving the next raw-key promise without an active event-loop handle. The prompt
cleanup now calls `process.stdin.resume()` before restoring raw mode. A second
PTY test entered `n`, `claude`, `2`; the planned row remained interactive and
`q` exited normally.

The first sandboxed `herdr plugin list --json` read returned an empty list even
though the unrestricted link had succeeded. Repeating the list and verifier
with normal access to Herdr's user registry proved the actual state:

```text
Account Fleet tests: pass
FirstMate Account Fleet linked and enabled: pass
0 failures
```

A first direct sanitized live snapshot ran under the documentation shell's
Homebrew Node 26 environment. `command -v quota-axi` failed there, so both
profiles correctly reported quota unavailable. The initial integration parser
also required the line to end immediately after `current (v8)`, while actual
Herdr status appends the installed hook path. Resolution: accept the documented
status prefix and keep all trailing output discarded.

The same live snapshot was rerun from a fresh NVM login shell (audit clone
location sanitized):

```sh
/bin/zsh -lic 'cd "$HOME/<workspace>/firstmate-multi-harness" && \
  node plugins/account-fleet/account-fleet.mjs --snapshot --live'
```

Sanitized actual result:

```text
Codex account1: wrapper/directory/auth/integration/quota all true
Claude account1: wrapper/directory/auth/integration/quota all true
```

No identity, hook path, quota amount, or raw command output appeared in the
snapshot.

The current documentation-engineering shell is not itself inside Herdr
(`HERDR_ENV` is unset). Herdr's shipped control skill explicitly forbids
opening or inspecting a user's focused session from that context. Therefore the
manifest and TUI are verified, while the final live `plugin pane open` overlay
check is left as an explicit in-Herdr verification rather than falsely recorded
as executed.

### Live Account Fleet overlay confirmation

The user ran the documented `herdr plugin pane open` command from an attached
Herdr session. Actual sanitized presentation result:

```text
Provider  Profile   State   Primary  Readiness
codex     account1  active  yes      not checked
claude    account1  active  yes      not checked
```

The overlay also rendered the documented verification, add, enable, promote,
retire, forget, setup-command, and close controls. This completes the live
presentation-layer check. Per-profile `v` verification remains an ordinary
user action and does not change routing metadata.

### Production FirstMate clone was missing

Goal: make the requested launch action usable rather than adding a button that
points at an absent coordinator checkout.

Diagnosis:

```sh
test -d "$HOME/src/firstmate"
test -d "$HOME/kun-agent-workspace"
```

Actual result: neither production path existed. The only available source was a
disposable FirstMate audit clone, so `scripts/launch-firstmate.sh` would have
stopped with its missing-directory diagnostic.

Resolution actually executed (temporary source path sanitized):

```sh
git clone /private/tmp/<firstmate-audit>/firstmate "$HOME/src/firstmate"
git -C "$HOME/src/firstmate" apply \
  "$HOME/Documents/workspace/Job-search/firstmate-multi-harness/patches/firstmate-forward-codex-home.patch"
mkdir -p "$HOME/src/firstmate/config"
cp examples/firstmate-backend "$HOME/src/firstmate/config/backend"
cp examples/crew-dispatch.json "$HOME/src/firstmate/config/crew-dispatch.json"
```

The installed checkout remained at the audited revision:

```text
6c1d2db194cb20e08232ba2fa2c414592f724b44
```

Verification actually executed:

```sh
FIRSTMATE_REPO="$HOME/src/firstmate" ./scripts/verify-firstmate.sh
```

Actual result: pinned revision, shell syntax, `CODEX_HOME` forwarding, Herdr
backend, absent `crew-harness`, dynamic dispatch JSON, diff check, and bootstrap
all passed.

### Coordinator launch and Pi login controls

Goal: expose the requested launch command and Pi `/login` from Account Fleet
without creating duplicate coordinators or handling credentials in the plugin.

Installed help verified these Herdr control primitives:

```sh
herdr tab create --help
herdr pane run --help
herdr agent list --help
herdr agent prompt --help
herdr agent focus --help
```

The first login shortcut attempted in an isolated empty Pi profile was:

```sh
PI_CODING_AGENT_DIR=/private/tmp/pi-login-button-test \
  pi --no-session --no-extensions --no-context-files "/login"
```

Expected behavior: open Pi's provider-login selector.

Actual useful output:

```text
Warning: No models available. Use /login to log into a provider via OAuth or API key.
Error: No API key found for the selected model.
```

Root cause: Pi interpreted the positional string as an initial message, not an
interactive slash command. Resolution: keep launch and login as separate UI
actions. The launch control creates a Herdr tab and runs the existing launcher;
the login control uses `herdr agent prompt <target> /login` only after finding
exactly one idle/done Pi whose working directory is the FirstMate home.

The plugin also refuses a second launch when that Pi already exists, and refuses
login for missing, duplicate, working, unknown, or blocked candidates.

Verification:

```sh
node --check plugins/account-fleet/account-fleet.mjs
node --test tests/account-fleet.test.mjs
bash -n scripts/launch-firstmate.sh scripts/verify-account-ui.sh
```

Initial deterministic result:

```text
7 tests, 7 passed, 0 failed
```

The test Herdr recorded the exact tab-create, pane-run, `/login` prompt, and
focus calls. A live click-through remains pending in the user's attached Herdr
workspace because this documentation shell is not the focused Herdr client.

At this seven-test point, the full verifier was rerun with ordinary user-level
access. Prerequisites, Codex account1, Claude account1, all selected Herdr
integrations, the installed production FirstMate clone, and Account Fleet
passed. The only remaining failure was the already-known independent Pi
coordinator login:

```text
Pi has no configured coordinator model; start pi and use /login
```

A subsequent local PTY presentation test rendered both new action labels, then
exposed another real defect: pressing `q` cleared the display but left stdin in
a resumed state, so the Node process did not exit until EOF. The close path now
explicitly pauses stdin after restoring terminal mode. A new process-level
regression sends `q` and requires a clean exit before its two-second timeout.
The revised deterministic result is:

```text
8 tests, 8 passed, 0 failed
```

The focused verifier was rerun after that correction. All eight tests passed,
and Herdr reported Account Fleet linked, enabled, and at version 0.2.0:

```text
0 failures
```

## 2026-09-04

### Account Fleet overlay reopened after the coordinator-control update

Goal: confirm that the linked plugin still opens in the live Herdr workspace
after adding the launch and Pi-login controls.

Command executed by the user:

```sh
herdr plugin pane open \
  --plugin firstmate.account-fleet \
  --entrypoint accounts
```

Expected behavior: Herdr opens and focuses the plugin's `accounts` overlay.

Actual sanitized result:

```text
plugin_id: firstmate.account-fleet
entrypoint: accounts
label: Account Fleet
workspace_id: w1
focused: true
agent_status: unknown
cwd: $HOME/Documents/workspace/Job-search/firstmate-multi-harness/plugins/account-fleet
```

This is a successful plugin-pane response. `agent_status: unknown` is the
status of the plugin's ordinary Node terminal process; it does not indicate
that opening the overlay failed. Visual confirmation and live activation of the
new `L` launch action remain the next checks.

### First live coordinator-launch action failed after tab creation

Goal: create a coordinator tab and run the existing launcher by pressing `L`.

Actual useful UI error:

```text
Herdr returned an invalid response for pane run
```

The failure occurred after `tab create` returned the root pane ID. The user was
instructed not to press `L` again because `pane run` may already have submitted
the launcher before Account Fleet rejected its response.

Investigation used the installed and official command contracts:

```sh
herdr pane run --help
herdr api schema --json
```

Installed help verifies `herdr pane run <PANE_ID> <COMMAND>...`. The bundled
protocol-20 schema includes the `tab_created` response used to acquire
`.result.root_pane.pane_id`, but it has no `pane_command_run` result. The current
official Herdr CLI reference says creation commands expose JSON IDs and
describes `pane run` as atomically submitting text plus Enter.

Root cause: Account Fleet 0.2.0 correctly observed exit status 0, then treated
the empty successful stdout as malformed JSON. The fake-Herdr fixture had
invented a `pane_command_run` JSON object, masking this behavior.

Herdr's tagged v0.8.2 source independently proves the response behavior:
`pane_run` calls `send_ok_request`, and `send_ok_request` returns status 0
without printing the successful response.

Resolution: Account Fleet 0.2.1 treats exit status 0 as sufficient only for
`pane run`; topology and agent queries still require their documented JSON
results. The fake now emits no pane-run output, so the regression matches the
installed CLI.

Verification commands:

```sh
node --check plugins/account-fleet/account-fleet.mjs
node --test tests/account-fleet.test.mjs
./scripts/verify-account-ui.sh
```

### FirstMate coordinator reached its interactive Pi screen

The already-created `firstmate-coordinator` tab confirmed that `pane run` had
submitted `./scripts/launch-firstmate.sh` successfully before Account Fleet
0.2.0 displayed its response-parser error.

Expected behavior: Pi starts from the production FirstMate clone and loads its
instructions, skills, and extensions.

Actual sanitized result:

```text
Context: $HOME/AGENTS.md, AGENTS.md
Skills: FirstMate operating, dispatch, diagnostics, lifecycle, project, and update skills listed
Extensions: fm-branch-supervision.ts, fm-calm.ts,
            fm-primary-pi-watch.ts, fm-primary-turnend-guard.ts,
            herdr-agent-state.ts
```

This verifies live tab creation, launcher submission, coordinator working
directory, and FirstMate context loading. It does not yet verify a coordinator
model or worker dispatch.

During startup, the coordinator detected missing private helper commands and
downloaded them successfully:

```text
fd installed to $HOME/.pi/agent/bin/fd
ripgrep installed to $HOME/.pi/agent/bin/rg
```

Read-only verification executed afterward:

```sh
"$HOME/.pi/agent/bin/fd" --version
"$HOME/.pi/agent/bin/rg" --version
```

Actual result:

```text
fd 10.5.0
ripgrep 15.2.0
```

The remaining startup warning is the expected independent Pi authentication
gap:

```text
Warning: No models available. Use /login to log into a provider via OAuth or API key.
```

Resolution requires the user to run `/login` in Pi and complete the provider's
interactive browser flow. Pi also offered version 0.85.0. No update was run:
the current reproducible stack remains pinned to tested Pi 0.84.4 until the new
release receives its own compatibility check.

### Coordinator provider authentication and Anthropic capacity failure

Goal: authenticate the live Pi coordinator and select its reasoning level.

The user completed Pi's Anthropic login and selected an Opus model. Pi saved
the credential under its private agent directory and immediately displayed the
installed provider warning that third-party harness usage draws from Anthropic
extra usage rather than Claude plan limits.

The first harmless message failed with the useful error:

```text
Error: 400 ... Third-party apps now draw from your extra usage, not your plan limits.
Add more at claude.ai/settings/usage and keep going.
```

The request identifier and personal absolute credential path were omitted.

Root cause: authentication succeeded, but the account had no applicable
Anthropic extra-usage capacity for a Pi request. A Claude subscription login in
Pi is not the same billing surface as Claude Code.

The documented coordinator resolution is to select `ChatGPT Plus/Pro (Codex)`
inside Pi, choose GPT-5.6 Sol in `/model`, and choose `xhigh` in `/thinking`.
The installed Pi 0.84.4 guide lists that subscription provider and verified
`openai-codex` support for GPT-5.6 Sol. OpenAI's current model page verifies that
GPT-5.6 Sol accepts `xhigh` reasoning.

Subsequent live output proved that Pi answered and displayed:

```text
Thinking level: xhigh
```

The captured excerpt did not show `/session` or a footer model ID, so the build
log does not claim that the exact live model ID was independently observed.

### Whole-home project discovery and Computer Projects UI

Goal: find project roots outside one workspace, including non-Git desktop
automation/document projects, without reading their contents or registering
anything automatically.

The first read-only Git-root scan covered the user's home while pruning macOS
Library data, credentials, caches, dependencies, and build directories. It
found:

```text
Git roots: 98
generated worktrees: 16
reference/external repositories: 23
other Git roots: 59
```

A specifically reported desktop project was absent from that list because it
was not a Git repository. Filename-only inspection confirmed a directory with
seven top-level Python scripts. Its personal name and document filenames are
not recorded in this public log.

The initial Computer Projects implementation generalized non-Git discovery too
far. Its first disposable whole-home scan returned:

```text
projectCount: 11046
non-git-candidate: 7627
reference: 3344
catalog mode: 0600
```

That output was rejected and never sent to FirstMate. Root cause: every nested
directory containing two source files was treated as a separate project.

The second implementation suppressed descendants after finding a non-Git
project, depth-bounded source-only candidates, and excluded non-Git matches
inside reference/vendor trees. It produced the accurate but slow result below
because live dirty checks ran across every canonical repository:

```text
projectCount: 99
non-git-candidate: 1
candidate: 58
generated-worktree: 16
reference: 23
firstmate-system: 1
```

The next normal scan deferred changeable branch, dirty, remote, duplicate, and
unpushed checks to FirstMate's explicit review. A cold JavaScript traversal
still took about two minutes, so it was rejected for an interactive button.

The final scanner stops descending when it finds a canonical Git or non-Git
project root and collapses generated-worktree, application, SDK, sample,
browser-resource, and external/reference collections into audit rows. Its
disposable final verification reported:

```text
projectCount: 151
non-git-candidate: 62
candidate: 47
reference collections: 37
generated-worktree collections: 4
firstmate-system: 1
process elapsed time: 0.27 seconds
catalog mode: 0600
```

Of those rows, 109 were actionable Git or non-Git candidates. Counts are a
point-in-time machine fact, not a fixed expected result. `--scan-live` remains
available as a slower optional diagnostic.

The Herdr plugin now declares separate `accounts` and `projects` overlays. The
Computer Projects pane can scan, filter, request a read-only inspection of one
candidate, or request a read-only deduplication review of the whole private
catalog. Both review actions require typed confirmation and target exactly one
idle/done Pi coordinator in the FirstMate home. Neither action registers a
project; FirstMate must return a proposal and wait for explicit approval.

Verification:

```sh
node --check plugins/account-fleet/project-fleet.mjs
node --test tests/account-fleet.test.mjs tests/project-fleet.test.mjs
./scripts/verify-account-ui.sh
```

Deterministic test result:

```text
13 tests, 13 passed, 0 failed
```

The plugin was then relinked into the running Herdr server. Herdr reported
version `0.3.0`, enabled, with both the `accounts` and `projects` panes. Opening
the new pane succeeded as `Computer Projects`. Its first live render showed:

```text
109 shown; 151 total; filter=candidates; unreadable directories=4
```

The live view included the specifically reported non-Git Desktop project. Its
private name remains excluded from this public build log. No FirstMate review
action was triggered during verification because that would disclose selected
path metadata to the coordinator/model and requires the user's explicit typed
confirmation.

### Fresh-shell verification and Claude Code pin refresh

Running `verify-all.sh` from the calling process initially resolved Homebrew
Node 26 plus old NVM v20 harnesses and could not find the AXI commands. This was
the documented stale-shell condition, not an installation failure. The same
command was rerun through a fresh Zsh login shell:

```sh
/bin/zsh -lic 'cd "$HOME/Documents/workspace/Job-search/firstmate-multi-harness"; ./scripts/verify-all.sh'
```

That shell correctly resolved Node 22.21.1, Pi 0.84.4, Codex CLI 0.151.0, and
all five pinned AXI tools from the Node 22 NVM prefix. Harness authentication,
strict quota evidence, Herdr integrations, FirstMate bootstrap, and all 13 UI
tests passed.

The only remaining failure was real version drift: the installed Claude Code
reported `2.1.261` while the guide expected the earlier audited `2.1.252`.
Direct npm and CLI checks confirmed:

```text
@anthropic-ai/claude-code@2.1.261
2.1.261 (Claude Code)
```

The clean-path pin and verifier were updated to `2.1.261`. Earlier `2.1.252`
entries above remain unchanged as historical evidence of the initial build.

Final verification after the pin refresh:

```text
prerequisites: passed
harnesses: passed
herdr-integrations: passed
firstmate: passed
account-ui: passed
overall: all verification groups passed
```

### First live bulk project intake and Codex worker dispatch

Goal: determine whether Pi was retaining approved project work instead of
handing it to worker harnesses.

The visible coordinator first ran read-only Python/Git inventory over the
private catalog. This collected canonical roots, branches, origin presence,
dirty state, unborn repositories, and duplicate origins. It did not modify the
source projects.

FirstMate's loaded rules establish that the coordinator owns project add
intake and private registry state. Its project-management procedure must resolve
source, managed name, delivery/autonomy posture, unused destination, duplicate
ownership, and clone safety before a managed project exists. Worker dispatch is
only valid afterward because `fm-spawn.sh` requires an isolated worktree for a
registered project.

Read-only operational-state inspection:

```sh
cd "$HOME/src/firstmate"
sed -n '1,260p' data/projects.md
find data -mindepth 2 -maxdepth 2 -name brief.md -print
find state -maxdepth 1 -name '*.status' -print
herdr agent list
```

Sanitized point-in-time result:

```text
registered projects: 26
import briefs: 26
latest brief states: working 8, needs-decision 3, done 2, blocked 1,
                     no status yet 12
```

Herdr reported the Pi coordinator plus numerous Codex agents whose primary
checkouts were managed FirstMate projects and whose foreground paths were
isolated Treehouse worktrees. The import briefs explicitly assigned coherent
source reconstruction, secret-safe filtering, testing, and delivery to those
crewmates while leaving the original source directories unchanged.

Root cause of the apparent non-delegation: the transcript excerpt captured the
coordinator-owned preflight before the subsequent spawn phase. The configured
rule routes repository implementation/import work to Codex at high effort, so
the observed worker choice matches `config/crew-dispatch.json`. Pi remained the
coordinator; Claude was not selected because this intake was implementation,
not the architecture/review/writing class.

Several worker states were intentional decision gates rather than dispatch
failures: three requested provenance/redistribution decisions, and one found no
project files to import. No worker result was merged by this inspection.

## 2026-09-12

### Same-provider account routing gap

Goal: explain why an existing `harness=codex` task did not switch from one
Codex account profile to another after the provider reported a usage limit.

Read-only inspection covered the Account Fleet registry, launcher, installed
FirstMate spawn/relaunch paths, teardown, `fm-procevent-quota.sh`, and the
installed quota-array skill. Relevant commands included:

```sh
git -C "$HOME/src/firstmate" status --short
rg -n 'CODEX_HOME|CLAUDE_CONFIG_DIR|HARNESS=|relaunch' \
  "$HOME/src/firstmate/bin" "$HOME/src/firstmate/AGENTS.md"
quota-axi --provider codex --json --no-credential-refresh
```

Actual result: FirstMate selected harnesses correctly, and the earlier custom
patch forwarded the coordinator's fixed `CODEX_HOME`. It did not call an
account selector, persist an account assignment, or choose a new same-provider
profile during relaunch. The quota process-event helper only wakes FirstMate at
a threshold; it does not change a running process's credential store.

The current strict Codex checks for account1 and the default store returned
stale/unknown evidence with no usable `spendPriority`. No quota amounts or
identity fields were recorded. No `1755` account-routing threshold was present
in FirstMate, Account Fleet, or quota-axi configuration. OpenAI documentation
also describes changing usage limits rather than one universal numeric cutoff.

Root cause: the original design correctly separated harness and account layers,
but implementation stopped after deterministic primary-directory forwarding.
The absence of real account2 subscriptions was incorrectly allowed to postpone
the selector itself instead of postponing only its live rollover test.

### Account router implementation

Resolution: add `scripts/account-router.mjs` below FirstMate harness dispatch.
It reads the sanitized Account Fleet registry, probes only active profiles in
the requested provider, keeps healthy task leases, prefers the healthy primary,
ranks usable alternates by schema-v5 `selection.spendPriority`, and fails closed
on stale, unknown, tied, projected-exhaustion, or exhausted evidence. The
default captain floor is `0%`; non-zero percentage floors are explicit UI/CLI
policy rather than invented defaults.

The router state uses mode `0600`. FirstMate-home paths are hashed into lease
keys so equal task IDs in separate homes cannot collide. Credential content,
identity, and raw quota payloads are neither stored nor printed.

Account Fleet 0.4.0 gained `a` (automatic routing on/off), `t` (captain quota
floor), and optional `default` profile support. `scripts/launch-firstmate.sh`
now exports the registry, router, and router-state paths to Pi.

The installed audited FirstMate clone was extended so `fm-spawn.sh` calls the
router only after the harness is resolved, validates that the returned provider
and harness are unchanged, sets only `CODEX_HOME` or `CLAUDE_CONFIG_DIR`, and
records only `account_profile=...`. `fm-teardown.sh` releases a task lease only
after successful task-record removal. Recovery guidance now uses the ordinary
controlled relaunch boundary and explicitly forbids cross-harness capacity
fallback. The complete reproducible change is stored in:

```text
patches/firstmate-account-routing.patch
```

### Verification and encountered test-environment failures

Command:

```sh
node --test tests/account-router.test.mjs tests/account-fleet.test.mjs
```

Actual result: all 20 tests passed at this milestone. A later concurrency case
raised the final combined total to 26 tests, including 13 router cases. Router
coverage includes primary preference, same-provider exhaustion rollover,
sticky leases, alternate ranking, stale/tied/projected-exhaustion refusal,
cross-provider refusal,
optional default profile, explicit threshold, routing-off behavior, lease
release, multi-home isolation, and proof that vendor probes run outside the
lease lock.

The first direct FirstMate regression attempt failed before executing its test
logic because the restricted environment prevented the suite's process-identity
helper from initializing:

```text
fm_test_tmproot: command not found
```

Root cause: `tests/lib.sh` returned early after its PID identity probe was denied
inside the restricted sandbox. The working verification was the same suite with
ordinary process-inspection permission:

```sh
cd "$HOME/src/firstmate"
tests/fm-spawn-dispatch-profile.test.sh
```

Actual result: the complete spawn dispatch-profile file passed, including the
new same-provider selection and malicious cross-provider-response refusal.

The first teardown invocation then stopped because its shell resolved Node 20
while `tasks-axi` existed only in the audited Node 22 NVM bin directory:

```text
tests/fm-teardown.test.sh: line 542: tasks-axi: command not found
```

Resolution and command:

```sh
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" \
  tests/fm-teardown.test.sh
```

The new account-lease ordering test passed. The broader file later stopped at:

```text
not ok - herdr-preflight-missing-adapter: teardown continued without its required preflight
```

That later case does not exercise the new lease helper, and no claim is made
that the complete teardown suite passed. It remains a separate FirstMate test
issue to re-audit rather than an error to hide or relabel.

Live account-to-account rollover remains unverified until a real second Codex
or Claude account is independently authenticated, activated, and exercised by
one controlled same-provider relaunch.

### Herdr plugin refresh

Goal: refresh the linked plugin after increasing its manifest to 0.4.0.

The first link attempt inside the restricted execution environment failed:

```text
Error: Os { code: 1, kind: PermissionDenied, message: "Operation not permitted" }
```

Root cause: Herdr's user-level plugin registry is outside the repository write
sandbox. Re-running the same reviewed command with ordinary user permission
succeeded:

```sh
herdr plugin link plugins/account-fleet --enabled
```

Verification returned sanitized fields only:

```text
plugin_id: firstmate.account-fleet
version: 0.4.0
enabled: true
```

All 26 isolated Account Fleet, account-router, and Computer Projects tests then
passed. The Herdr server was running with zero workspaces after the user closed
its window, so no live overlay was opened or invented as a successful test in
this update.

### Claude Code pin refreshed after full verification

Goal: run the repository's complete read-only verifier against the live machine.

Command:

```sh
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" \
  ./scripts/verify-all.sh
```

Actual result: the harness, Herdr integration, FirstMate, and Account Fleet
groups passed. Both active `account1` profiles had usable vendor login state and
fresh strict quota evidence. All 26 isolated UI/router tests passed. The
prerequisite group alone failed because the live Claude Code version had moved
from the previously audited 2.1.261 to 2.1.270:

```text
FAIL: claude version is '2.1.270 (Claude Code)'; this guide audited '2.1.261 (Claude Code)'
```

Root cause: the installed executable was newer than the repository's exact
reproducibility pin. This was version-record drift, not a harness, authentication,
quota, or routing failure.

Resolution: after verifying `claude --version` directly, update the clean-path
package pin and exact-version check to the observed 2.1.270 release, then rerun
the complete verifier.

Verification: the second `verify-all.sh` run completed with all five groups
passing and zero failures. The installed 2.1.270 package metadata also reported
its Node requirement as `>=22.0.0`.

### Public repository creation and first push transport failure

Goal: create the requested public GitHub repository and push the audited `main`
branch.

Command:

```sh
gh repo create firstmate-multi-harness --public --source=. --remote=origin --push
```

Actual result: GitHub created the public, empty repository, but the push failed:

```text
git@github.com: Permission denied (publickey).
fatal: Could not read from remote repository.
failed to run git: exit status 128
```

Diagnosis confirmed that the new `origin` used the SSH URL while this machine
did not have an accepted GitHub SSH key for that transport. `gh repo view`
confirmed that the repository existed, was public, and was still empty; no
partial code publication occurred.

Resolution: change only this repository's `origin` to the HTTPS clone URL, keep
the user's global GitHub CLI configuration unchanged, rerun the publication
checks, and push `main` without force.

Working commands:

```sh
git remote set-url origin \
  https://github.com/chinedunnaji-bit/firstmate-multi-harness.git
./scripts/check-publication.sh
git push -u origin main
```

Actual result: the publication checker reported zero failures, HTTPS push
succeeded, and local `main` began tracking `origin/main`. Final remote
verification with `gh repo view` reported `visibility=PUBLIC`, `isEmpty=false`,
and default branch `main`.

### Live Codex relaunch refused on projected exhaustion

Goal: explain why FirstMate refused to relaunch the existing Codex fleet even
though account1 was not reported as exhausted yet.

The first diagnostic selector invocation ran from a shell whose PATH did not
contain the audited Node 22 NVM bin directory and returned:

```text
account-router: codex account routing stopped (no_usable_profile); account1:quota_probe_failed
```

Root cause for that diagnostic-only result: `quota-axi` was not found in that
shell. Re-running the strict read-only probe with the same Node 22 PATH used by
the verified stack returned sanitized current evidence:

```text
schemaVersion: 5
state: fresh
stale: false
effective scope: all_models
availability: known
runway: projected_exhaustion
```

Installed quota-axi documentation defines `projected_exhaustion` as measurable
cycle-average usage projecting that at least one authoritative quota window will
empty before its own reset. It is completion-risk evidence, not a claim that the
account is already at zero.

The current account router deliberately makes that state ineligible because a
generic selector does not know a worker's remaining task duration. Account Fleet
currently has only Codex account1 active, so no same-provider alternate exists.
A controlled relaunch would therefore stop the old process and fail before
starting its replacement, while preserving its worktree and task record.

No routing change was made during diagnosis. The immediate operator choices are
to leave the fleet untouched, explicitly disable automatic Codex routing to use
the primary without a quota gate, add a verified Codex alternate, or change the
router policy so projection is advisory until a configured threshold is crossed.

### Projected exhaustion changed from a hard stop to an advisory

The captain clarified the intended fleet policy: continue using an account
until it is actually exhausted, or until it crosses a non-zero floor the captain
explicitly configured, then rotate among active accounts in the same provider.

Root cause: the first router implementation promoted quota-axi's completion-risk
forecast into an unconditional availability gate. A live fresh Codex account
still had known remaining capacity, but its weekly cycle-average pace produced
`projected_exhaustion`; the router therefore refused even a short new task. That
was stricter than the requested exhaustion-based rotation policy.

Resolution: keep the runway evidence visible but classify both `through_reset`
and `projected_exhaustion` as ready while remaining capacity is above the
configured floor. `exhausted_now`, zero remaining, the explicit floor, stale or
unknown evidence, and unsupported runway states retain their fail-closed
behavior. Same-provider and no-cross-provider rules are unchanged.

The follow-up live no-lease selection returned `harness=codex`,
`profile=account1`, `status=ready`, and retained
`runway=projected_exhaustion` as advisory evidence. Account Fleet also gained a
verification-gated `--enable` command so an already planned profile can be made
active noninteractively only after its wrapper, directory, authentication,
Herdr integration, and quota checks all pass.

The first activation implementation treated a fresh provider-level quota state
as sufficient even when effective all-model availability or runway was unknown.
A live selector check exposed that mismatch. The activation gate was tightened
to require quota schema v5, a fresh non-stale provider report, known positive
effective availability, and a supported `through_reset` or advisory
`projected_exhaustion` runway. The router still rechecks every active profile at
each selection, so a transiently unmeasurable alternate cannot receive work.

During that investigation, the bare Codex `default` row was added and activated
under the first, weaker gate in the standalone host registry. The tightened
live view then correctly showed its quota check as false because effective
availability was unknown. The row was retired immediately; its profile
directory and authentication data were not modified. The active Herdr registry
continued to contain only account1 for Codex and account1 for Claude. No worker
was stopped or relaunched.

The audit also found that the Account Fleet pane used Herdr's plugin config
directory while a direct host-terminal invocation initially fell back to a
separate repository-specific config directory. The launcher already discovered
Herdr's directory, but lifecycle CLI commands could otherwise update the wrong
registry. `configPath()` now asks the installed, documented command for the
shared directory when no explicit environment override exists:

```sh
herdr plugin config-dir firstmate.account-fleet
```

The installed command returned the expected plugin config directory. A new
isolated regression proves that host CLI writes resolve there and do not create
the fallback file. The combined account/router/project test total is now 28.

An attempted verification command named
`./scripts/verify-account-router.sh` failed with `no such file or directory`;
that script does not exist. Router tests are intentionally part of
`./scripts/verify-account-ui.sh`. Its first restricted automation run could not
read Herdr's external plugin registry and misleadingly reported the plugin as
unlinked; direct diagnosis returned `Operation not permitted`. Re-running the
same read-only check with access to the Herdr registry confirmed Account Fleet
0.4.1 was linked and enabled.

Final verification used the audited Node 22 PATH. All prerequisite, harness,
Herdr integration, FirstMate patch, and Account Fleet groups passed. A live
no-lease Codex selection then returned account1 as `ready` and
`primary_healthy` with 78% effective capacity at that instant, while preserving
`projected_exhaustion` as advisory evidence. The percentage is a volatile
observation, not a documented installation constant.

### No Mistakes gate initialization

Goal: run the requested public-push validation through the installed No
Mistakes gate.

The initial read-only home command returned:

```text
error: repo not initialized (run 'no-mistakes init' first)
```

After verifying the installed command's help, the repository was initialized:

```sh
no-mistakes init
```

Actual result: No Mistakes created its local bare validation gate and added the
repository-local `no-mistakes` remote. It did not change tracked files. The
installed v1.60.2 command also advertised v1.72.0, but no tool update was mixed
into this routing-policy change.
