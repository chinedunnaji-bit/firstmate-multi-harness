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
