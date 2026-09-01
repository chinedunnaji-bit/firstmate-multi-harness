# Daily usage

## Start or reattach Herdr

In a normal terminal:

```sh
cd "$HOME/src"
herdr
```

If the default session already exists, this reattaches to it. Pane processes
that continued running while detached remain present.

## Start the FirstMate coordinator

In the coordinator Herdr pane:

```sh
cd "$HOME/src/firstmate"
CODEX_HOME="$HOME/.codex-account1" \
CLAUDE_CONFIG_DIR="$HOME/.claude-account1" \
  pi
```

The Pi process is the coordinator because it starts from the FirstMate home.
Starting Pi in an unrelated Git project creates a normal Pi coding session, not
a FirstMate coordinator.

## Describe work

Talk to the coordinator in terms of the task and constraints. FirstMate applies
the dynamic dispatch rules and selects a concrete worker harness.

Examples:

```text
Investigate this failure and report the root cause; do not make changes.
Fix the failing test and deliver it through the project's configured mode.
Review this implementation for architectural and security risks.
```

For controlled verification, explicitly request a verified worker harness:

```text
Use the Codex worker harness for this bounded scout.
```

The explicit override is per task. It does not change
`config/crew-dispatch.json`.

## Watch and steer workers

FirstMate creates worker endpoints through the selected backend and records
their task state. With Herdr, switch to the relevant worker workspace/pane in the
UI, or let FirstMate use its own `fm-peek.sh` and `fm-send.sh` supervision
interfaces.

Avoid manually typing into a worker unless you understand whether FirstMate is
also steering it. Use the coordinator as the normal liaison.

## Detach without stopping work

Inside Herdr:

```text
Ctrl-b, release, then q
```

This detaches the UI. It does not stop Herdr's server or pane processes.

Reattach later:

```sh
herdr
```

Source: [Herdr persistence and remote access](https://herdr.dev/docs/persistence-remote/).

## Continue or resume harness sessions

Normal detach/reattach does not require a harness resume command because the
original processes remain alive.

If the process ended but its native session was recorded, current CLIs expose:

```sh
pi --continue
pi --resume
claude --continue
claude --resume
```

Codex, Claude, and Pi also have current Herdr integrations for native session
identity/restore. Herdr can restore supported agent sessions after a server
restart when the required integration revision is current.

Do not run resume commands blindly in the coordinator home. First reattach and
let FirstMate reconcile its durable task state so it can distinguish a live
agent, a restorable session, and a completed task.

Sources: [Herdr session restore](https://herdr.dev/docs/session-state/),
[Claude CLI session options](https://code.claude.com/docs/en/cli-usage).

## Finish work before shutdown

Ask FirstMate for fleet/task status and resolve pending decisions. Detach if you
only want to leave the UI.

To intentionally stop the default Herdr server and all pane processes:

```sh
herdr server stop
```

This is destructive to running processes, though durable FirstMate and harness
session state may allow later reconciliation or restore. Do not use it as a
logout shortcut.

For a named session:

```sh
herdr session stop <name>
```

## Check the stack

Run from this setup repository in a fresh terminal:

```sh
./scripts/verify-all.sh
```

Use focused checks when diagnosing one layer:

```sh
./scripts/verify-prerequisites.sh
./scripts/verify-harnesses.sh
./scripts/verify-herdr-integrations.sh
./scripts/verify-firstmate.sh
```

The account checks select account1 for both providers by default. To verify a
different active set without requiring unused slots:

```sh
FM_VERIFY_CODEX_PROFILES="account1 account2" \
FM_VERIFY_CLAUDE_PROFILES=account1 \
  ./scripts/verify-all.sh
```

See [account lifecycle](account-lifecycle.md) before adding, retiring, or
promoting a profile.

## Update Herdr

For an installation managed by Herdr's installer:

```sh
herdr update
```

If a protocol change requires stopping the old server, finish/reconcile active
work first. `herdr server stop` exits the panes. The experimental
`herdr update --handoff` path is not part of this clean procedure.

## Update Treehouse and No Mistakes

Both installed binaries advertise update commands:

```sh
treehouse update
no-mistakes update
```

After updating, rerun:

```sh
treehouse get --help | grep -- --lease
no-mistakes --version
```

## Update npm-installed harnesses and AXI tools

Do not switch Node versions accidentally during an update. Start in a fresh
shell and confirm:

```sh
node --version
npm prefix -g
```

Review current package release notes and Node engine requirements. Then install
explicit reviewed versions using the same package names as the installation
guide. Rerun `verify-all.sh` after every coordinated version change.

Avoid documenting a new version as supported merely because installation
succeeded; exercise its help surface, authentication status, Herdr integration,
FirstMate bootstrap, and at least one controlled worker lifecycle.

## Update FirstMate while preserving the local patch

The audited FirstMate checkout has one intentional tracked change. Before an
upstream update, finish active work and inspect:

```sh
git -C "$HOME/src/firstmate" status --short
git -C "$HOME/src/firstmate" diff -- bin/fm-spawn.sh
```

The following reverse-check/apply sequence was validated against the staged
patch. First confirm the reverse check succeeds:

```sh
git -C "$HOME/src/firstmate" apply --reverse --check \
  "$HOME/src/firstmate-multi-harness/patches/firstmate-forward-codex-home.patch"
```

Only after reviewing that result, remove the patch, update by fast-forward, and
inspect the new source:

```sh
git -C "$HOME/src/firstmate" apply --reverse \
  "$HOME/src/firstmate-multi-harness/patches/firstmate-forward-codex-home.patch"
git -C "$HOME/src/firstmate" switch main
git -C "$HOME/src/firstmate" pull --ff-only
grep -n 'CODEX_HOME' "$HOME/src/firstmate/bin/fm-spawn.sh"
```

If upstream now forwards `CODEX_HOME` into Codex worker launches, do not reapply
the patch. If it does not, first verify the dated patch still applies cleanly:

```sh
git -C "$HOME/src/firstmate" apply --check \
  "$HOME/src/firstmate-multi-harness/patches/firstmate-forward-codex-home.patch"
```

Apply it only after that check succeeds. Then rerun FirstMate bootstrap,
`verify-firstmate.sh`, and the relevant upstream dispatch regression. If the
check fails, adapt and re-test the patch rather than forcing it.

The repository verifier intentionally rejects a FirstMate revision other than
the audited commit. A successful upstream update is therefore still
`unverified` by this dated guide until its revision, behavior, and evidence are
reviewed and the setup repository itself is updated.

## Public-repository maintenance

Before pushing documentation or script changes:

```sh
git status
git diff --cached
git grep -nEi 'api[_-]?key|token|secret|password|authorization|bearer'
./scripts/check-publication.sh
```

Read [security](security.md) before accepting any match or publishing a build
log.
