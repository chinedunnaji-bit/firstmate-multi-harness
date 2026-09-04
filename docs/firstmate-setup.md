# FirstMate setup

FirstMate is the orchestration layer. There is no standalone `firstmate`
command. Running a supported primary harness from the FirstMate clone loads its
operating contract, scripts, skills, local data, and state.

Source: [FirstMate](https://github.com/kunchenguid/firstmate).

## Clone and identify the source

```sh
mkdir -p "$HOME/src"
git clone https://github.com/kunchenguid/firstmate.git "$HOME/src/firstmate"
git -C "$HOME/src/firstmate" checkout --detach \
  6c1d2db194cb20e08232ba2fa2c414592f724b44
git -C "$HOME/src/firstmate" rev-parse HEAD
```

Audited revision:

```text
6c1d2db194cb20e08232ba2fa2c414592f724b44
```

The detached checkout pins the source used by this guide. FirstMate moves
independently of this setup repository; preserve the exact revision in bug
reports and treat an update as a new compatibility audit.

## Apply the Codex profile-boundary patch

Current audited FirstMate explicitly forwards `CLAUDE_CONFIG_DIR` when launching
a Claude worker in a daemon-created pane, but its Codex launch is a bare
`codex`. That makes an isolated coordinator `CODEX_HOME` disappear at the
worker boundary.

Apply this repository's minimal symmetric patch:

```sh
git -C "$HOME/src/firstmate" apply --check \
  "$HOME/src/firstmate-multi-harness/patches/firstmate-forward-codex-home.patch"
git -C "$HOME/src/firstmate" apply \
  "$HOME/src/firstmate-multi-harness/patches/firstmate-forward-codex-home.patch"
```

Verify:

```sh
bash -n "$HOME/src/firstmate/bin/fm-spawn.sh"
grep -F 'LAUNCH="CODEX_HOME=$(shell_quote "$CODEX_HOME") $LAUNCH"' \
  "$HOME/src/firstmate/bin/fm-spawn.sh"
```

Evidence:

- the patch applied cleanly to a clean clone of the audited commit;
- `bash -n` and `git diff --check` passed;
- FirstMate's complete `fm-spawn-dispatch-profile.test.sh` passed in 86.773
  seconds with 0 failures;
- the regression included a set case proving the literal worker launch received
  `CODEX_HOME`, and an unset case proving the single-store default stayed clean.

This is a custom addition, not an upstream FirstMate feature claim. If a later
upstream release adds equivalent forwarding, remove the local patch rather than
applying both.

## Install the local configuration

```sh
mkdir -p "$HOME/src/firstmate/config"
cp "$HOME/src/firstmate-multi-harness/examples/firstmate-backend" \
  "$HOME/src/firstmate/config/backend"
cp "$HOME/src/firstmate-multi-harness/examples/crew-dispatch.json" \
  "$HOME/src/firstmate/config/crew-dispatch.json"
```

Do not create `config/crew-harness`.

The resulting local state is:

```text
config/backend             herdr
config/crew-dispatch.json  dynamic Pi/Codex/Claude rules
config/crew-harness        absent
```

FirstMate ignores `config/` in its own Git repository, so account-independent
runtime choices do not become upstream source changes.

## Validate bootstrap and dispatch facts

```sh
cd "$HOME/src/firstmate"
FM_BOOTSTRAP_DETECT_ONLY=1 \
FM_BOOTSTRAP_NETWORK=skip \
FM_BOOTSTRAP_VERBOSE_FACTS=1 \
  bin/fm-bootstrap.sh
```

Audited relevant output:

```text
BOOTSTRAP_INFO: crew dispatch active config/crew-dispatch.json
BOOTSTRAP_INFO: crew dispatch rule: ... -> codex/default/high
BOOTSTRAP_INFO: crew dispatch rule: ... -> claude/default/high
BOOTSTRAP_INFO: crew dispatch rule: ... -> pi/default/medium
BOOTSTRAP_INFO: crew dispatch default: pi/default/medium
```

There must be no `CREW_DISPATCH:` or `MISSING:` diagnostic.

Run the non-mutating repository check as a second proof:

```sh
FIRSTMATE_REPO="$HOME/src/firstmate" \
  "$HOME/src/firstmate-multi-harness/scripts/verify-firstmate.sh"
```

## Start the coordinator under Herdr

In a normal terminal, enter the workspace and start Herdr:

```sh
cd "$HOME/src"
herdr
```

Inside the desired Herdr pane:

```sh
cd "$HOME/src/firstmate"
CODEX_HOME="$HOME/.codex-account1" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  pi
```

On the first run, inspect and approve Pi's project trust prompt so the tracked
FirstMate Pi extensions load.

Why both environment variables are set on the coordinator:

- audited FirstMate already forwards `CLAUDE_CONFIG_DIR` to Claude workers;
- the tested local patch forwards `CODEX_HOME` to Codex workers;
- account1 is the requested preferred profile for each provider.

The Herdr backend is selected explicitly by `config/backend`; running inside
Herdr also provides the runtime pane identity FirstMate needs to place and
supervise workers safely.

### Live-test status

The command shape, config validation, profile forwarding, Herdr integration
matrix, Herdr tab creation, launcher execution, and FirstMate context loading
are verified. The live Pi screen listed FirstMate's skills and extensions. The
audit host still needs an interactive Pi `/login` before the first coordinator
turn and real Pi/Codex/Claude worker dispatches can be exercised. Until those
tests pass, this repository must not claim end-to-end live routing is complete.

## First conversation

Once Pi is authenticated, begin with a read-only request that lets FirstMate
identify itself and report bootstrap status. Then register or identify a test
Git project according to FirstMate's normal intake.

Use explicit harness overrides for the first three controlled worker tests:

```text
Dispatch this bounded read-only scout with the Pi worker harness.
Dispatch this bounded read-only scout with the Codex worker harness.
Dispatch this bounded read-only scout with the Claude worker harness.
```

After explicit tests succeed, use ordinary task descriptions and inspect which
rule FirstMate selected. Do not use production repositories for the initial
worker tests.

## Supporting tools

FirstMate's audited universal toolchain uses:

- `tasks-axi` for structured backlog operations;
- `quota-axi` when a matched dispatch profile is an array;
- `gh-axi` for GitHub operations;
- `chrome-devtools-axi` for browser/DevTools operations;
- `lavish-axi` for rich review/annotation workflows;
- No Mistakes for the `no-mistakes` project delivery mode;
- Treehouse for durable task-worktree leases.

The included default dispatch file uses single profile objects, so its task-type
routing does not require quota-array selection. Quota-aware profile arrays and
account-aware selection are separate extensions described in the routing docs.
