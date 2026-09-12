# Account Fleet UI

Account Fleet is this repository's local Herdr plugin for managing sanitized
Codex and Claude profile metadata. It opens as a terminal overlay inside Herdr;
it is not a browser service and it does not patch Herdr or FirstMate.

The same plugin also declares a separate [Computer Projects](project-ui.md)
pane. Account Fleet owns provider profiles; Computer Projects owns private,
read-only project discovery. Neither pane stores credentials.

Herdr 0.8.2 officially supports out-of-process workflow plugins and
manifest-declared terminal panes. Native non-terminal plugin panes are not part
of plugin v1, so a managed terminal overlay with keyboard-operated action
buttons is the supported visual surface.

Source: [Herdr plugins](https://herdr.dev/docs/plugins/).

## What it manages

Each provider profile has one routing state:

| State | Meaning |
| --- | --- |
| `planned` | The local label exists, but FirstMate must not route work to it. |
| `active` | The profile passed readiness checks and may be selected. |
| `retired` | The profile is excluded from routing but retained for reversible cleanup. |

One active profile per provider is marked primary. `scripts/launch-firstmate.sh`
reads those two primary selections, exports `CODEX_HOME` and
`CLAUDE_CONFIG_DIR`, exports the registry/router paths, changes to the FirstMate
clone, and executes Pi. Each provider also has an independent automatic-routing
toggle and an explicit quota floor.

The registry contains only provider names, local `default`/`accountN` labels,
lifecycle states, primary selections, routing toggles, and percentage floors.
Herdr stores it at:

```sh
printf '%s\n' \
  "$(herdr plugin config-dir firstmate.account-fleet)/accounts.json"
```

The file mode is `0600`. It contains no vendor identity, token, password,
quota amount, or credential path contents.

## Install and open

Link the reviewed local plugin from the setup repository:

```sh
cd "$HOME/src/firstmate-multi-harness"
herdr plugin link plugins/account-fleet --enabled
herdr plugin list --plugin firstmate.account-fleet
```

Account Fleet runs `node`, the harness CLIs, Herdr, and `quota-axi` from the
environment inherited by the Herdr server. Before starting Herdr, use the same
fresh NVM shell required by the rest of this guide:

```sh
node --version
command -v quota-axi codex claude
```

The audited working shell reported Node 22.21.1 and resolved all three Node
tools from the selected NVM prefix. A shell using Homebrew Node 26 did not have
`quota-axi` on `PATH`, so strict readiness correctly reported `quota: no`.

Start or attach to Herdr:

```sh
cd "$HOME/src"
herdr
```

From a normal terminal while a Herdr workspace is active, open the overlay:

```sh
herdr plugin pane open \
  --plugin firstmate.account-fleet \
  --entrypoint accounts
```

The installed Herdr 0.8.2 help surface was used to verify `plugin link`,
`plugin list`, and the `overlay` placement accepted by `plugin pane open`.
The manifest and terminal renderer were first exercised locally. The user then
ran the documented open command against an attached Herdr session; the live
overlay rendered active primary `account1` rows for Codex and Claude with
readiness initially shown as `not checked`. No identity, quota amount, or
credential content appeared.

## Controls

The action row at the top is:

```text
Coordinator  [ L  Launch FirstMate ]  [ /  Open Pi Login ]
```

```text
L        verify both primary profiles and launch a coordinator tab
/        send Pi's /login slash command to the idle coordinator
Up/Down  select a profile
v        verify the selected profile
n        add a planned default or accountN label
e        enable only after all readiness checks pass
p        make an active profile primary
r        retire a non-primary profile from routing
x        forget a planned/retired registry entry
c        show the exact setup commands
a        toggle automatic same-provider selection for this provider
t        set its explicit remaining-quota floor from 0 through 100 percent
q        close the overlay
```

These are terminal-UI buttons activated by the displayed keys; Herdr plugin v1
does not provide native mouse-clickable or browser controls.

## Launch and log in to Pi

Press `L`, then type `launch` at the confirmation. Account Fleet:

1. refuses to run outside an active Herdr workspace;
2. refuses to launch if a Pi agent already exists in the FirstMate home;
3. verifies the selected primary Codex and Claude profiles;
4. creates a `firstmate-coordinator` tab in the current Herdr workspace; and
5. runs `./scripts/launch-firstmate.sh` from this setup repository's actual
   checkout, with `$HOME/src/firstmate` as the default coordinator home.

Close the overlay, select the new tab, and inspect Pi's project-trust prompt.
Approve it only after confirming that Pi is running from the intended FirstMate
clone. Wait for Pi's interactive screen to become idle.

Reopen Account Fleet and press `/`. The action targets only an idle/done Pi
agent whose working directory is exactly the configured FirstMate home, sends
the literal `/login` slash command through Herdr, and focuses that agent. It
refuses missing, duplicate, working, unknown, or blocked coordinator states.
Complete the provider selection and browser authentication in Pi; Account Fleet
never receives the credential.

Launch and login are separate because the first-run trust prompt occurs before
Pi is ready for slash commands. The apparent shortcut below was tested and
failed:

```sh
pi "/login"
```

Pi treated the argument as an ordinary initial chat message, not as its
interactive `/login` command. See [troubleshooting](troubleshooting.md#pi-login-does-not-open-when-passed-as-a-startup-argument).

Verification retains only booleans for:

- expected wrapper exists and is executable;
- isolated profile directory exists;
- vendor CLI reports an authenticated session;
- selected Herdr integration reports `current`;
- strict `quota-axi --no-credential-refresh` evidence is fresh.

Command stdout and stderr are never rendered. In particular, the UI does not
show account identity, quota amounts, auth JSON, Keychain content, or raw quota
JSON.

## Add an account

Press `n`, select `codex` or `claude`, and enter `default` or a positive account
number. The new profile starts as `planned`, so adding the label cannot route
work to an unfinished login.

Press `c` to display the setup commands. Run them from the repository root in a
normal terminal. Authentication remains an interactive vendor-CLI flow and
never occurs inside Account Fleet. Return to the overlay, press `v`, and press
`e` only after all five checks show `yes`.

The command view also includes the tested `gh-axi`, `chrome-devtools-axi`, and
`lavish-axi` hook setup paired with the other provider's current primary.

Adding Codex and Claude accounts is independent; account numbers do not need to
match.

Once a row is active, it is eligible for new tasks and controlled relaunches in
that provider. The router prefers the primary while it is healthy, keeps a
healthy existing task lease, and considers other active rows only when the
primary is unavailable. It never changes a Codex task into Claude or a Claude
task into Codex.

Press `a` to disable automatic selection for a provider. With routing off, new
workers use that provider's primary without a quota probe. Press `t` to set a
captain-defined percentage floor. The initial `0%` means only reported
exhaustion triggers percentage-based switching; no hidden `1755` or other
numeric cutoff is baked into this repository.

## Promote, retire, and remove

Press `p` to make a verified active profile primary. On the next coordinator
launch, use:

```sh
cd "$HOME/src/firstmate-multi-harness"
./scripts/launch-firstmate.sh
```

The launcher refuses a missing primary profile directory or invalid registry.

Press `r` to retire a non-primary profile. This only changes routing metadata;
it deliberately does not log out, disable the wrapper, archive configuration,
or delete anything. Promote another active account before retiring the current
primary.

Press `x` to forget a planned or retired registry entry. The confirmation names
the exact local label. Forgetting still leaves the wrapper, vendor login,
profile directory, and Herdr integration untouched. Use
[account lifecycle](account-lifecycle.md) for explicit logout, integration
uninstall, reversible archival, and eventual Finder/Trash cleanup.

## Verify

Run the deterministic tests and confirm the plugin is linked:

```sh
./scripts/verify-account-ui.sh
```

The account and router tests use disposable fake homes and fake harness/Herdr
output. They prove lifecycle, primary selection, same-provider rollover,
cross-provider refusal, task leases, launcher environment, duplicate
coordinator guard, exact Pi targeting, `/login` delivery, clean close, and
redaction without touching a real vendor account.

For a sanitized live snapshot without opening the overlay:

```sh
plugin_root="$HOME/src/firstmate-multi-harness/plugins/account-fleet"
node "$plugin_root/account-fleet.mjs" --snapshot --live
```

The snapshot contains health booleans only.

## Remove the UI itself

Unlinking the local plugin is separate from retiring a provider account:

```sh
herdr plugin unlink firstmate.account-fleet
```

Herdr's documented unlink operation unregisters a local plugin and leaves its
source and config files in place. Review the config directory printed above and
move its non-secret registry to Trash separately if it is no longer wanted.
