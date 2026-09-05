# Computer Projects UI

The Computer Projects pane creates a private, read-only catalog of project
candidates across the current macOS user's home directory. It covers ordinary
locations such as Desktop, Documents, Downloads, and `src`; projects do not
need to live in one workspace folder or already use Git.

This catalog is deliberately separate from FirstMate's managed-project
registry:

```text
user home                         private discovery only
  Desktop/project-a                       │
  Documents/work/project-b                ▼
  Downloads/project-c          Computer Projects catalog
                                           │ explicit review and approval
                                           ▼
                               FirstMate data/projects.md
                                           │
                                           ▼
                               FirstMate projects/<name>
```

Discovery does not make a directory manageable. FirstMate still clones or
creates each approved project under its own `projects/` directory and records
its delivery posture in `data/projects.md`.

## Security boundary

The normal scan reads directory names and detects Git-root/project-marker
filenames. It never opens project file contents, remote URLs, authentication
files, cookies, tokens, SSH material, or Keychain data.

The scanner skips macOS Library data, hidden configuration and credential
directories, dependency trees, caches, and common build output, including:

```text
Library  .ssh  .config  .pi  .codex*  .claude*
node_modules  .venv  venv  Pods  DerivedData  target  build  dist
```

Its private catalog contains real local paths, classifications, and optional
boolean Git-health metadata. Herdr stores it beside the Account Fleet registry:

```sh
config_dir=$(herdr plugin config-dir firstmate.account-fleet)
printf '%s/projects.json\n' "$config_dir"
```

The file is written atomically with mode `0600`, is outside this Git repository,
and must never be committed or published.

A project containing legal, financial, health, employment, or other sensitive
documents is opt-in even when discovery finds it. Approving FirstMate to inspect
or work on such a project can send selected content to the configured model
provider. Discovery itself does not grant that approval.

## Open the pane

Link or refresh the local plugin from the setup repository:

```sh
cd "$HOME/src/firstmate-multi-harness"
herdr plugin link plugins/account-fleet --enabled
```

With Herdr and the FirstMate coordinator running, open Computer Projects:

```sh
herdr plugin pane open \
  --plugin firstmate.account-fleet \
  --entrypoint projects
```

Herdr plugin v1 supplies managed terminal panes, so these are keyboard-operated
action buttons rather than native mouse controls.

## Controls

```text
S          scan the current user's home directory
Up/Down    select a project candidate
f          switch between actionable candidates and the complete catalog
i          ask FirstMate to inspect only the selected candidate, read-only
A          ask FirstMate to review and deduplicate the entire catalog, read-only
q          close the overlay
```

Both review controls require a typed confirmation. They target exactly one
idle/done Pi process whose foreground working directory is the configured
FirstMate home. They refuse a missing, duplicate, busy, blocked, or unknown
coordinator.

The generated request explicitly prohibits cloning, registration,
initialization, pushing, editing, moving, or deleting. FirstMate returns a
proposed intake table and must wait for the user's explicit approval before it
changes either registry or filesystem state.

## Classifications

| Classification | Meaning |
| --- | --- |
| `candidate` | Canonical-looking Git repository requiring review. |
| `non-git-candidate` | Directory with a project manifest or nearby source-file evidence, but no Git root. |
| `managed` | Already under FirstMate's private `projects/` root. |
| `generated-worktree` | Collapsed `.worktrees` or `*-worktrees` collection. |
| `reference` | Collapsed application, SDK, external, vendor, fixture, sample, browser-resource, or reference-template collection. |
| `firstmate-system` | The FirstMate source clone itself. |

Only `candidate` and `non-git-candidate` rows appear in the default view.
Generated worktrees and reference collections remain visible under the `all`
filter for auditability but should normally not become independent FirstMate
projects. The scanner stops descending once it identifies a canonical Git or
non-Git project root. Nested copies are reviewed from their canonical parent
instead of flooding the catalog as independent projects.

Non-Git discovery deliberately suppresses nested matches after identifying a
project root. Source-file-only detection is depth-bounded; manifest-based
projects can be deeper. This prevents one source tree from becoming thousands
of false projects while still finding a shallow desktop automation directory.

## CLI scan and verification

Run the same normal scan without opening Herdr:

```sh
plugin_root="$HOME/src/firstmate-multi-harness/plugins/account-fleet"
node "$plugin_root/project-fleet.mjs" --scan
```

The command prints only sanitized counts. To perform the optional, slower scan
that also derives branch, origin-presence, and dirty booleans without retaining
Git command output:

```sh
node "$plugin_root/project-fleet.mjs" --scan-live
```

The UI uses the faster normal scan. FirstMate performs current dirty, unpushed,
remote, duplicate, and delivery-posture checks during its explicit review;
those facts can change and must not be trusted from an old catalog.

Verify the implementation:

```sh
./scripts/verify-account-ui.sh
```

The tests use a disposable home containing canonical Git, generated-worktree,
reference, non-Git, dependency, and credential-directory fixtures. They also
prove that file contents and remote URLs do not enter the catalog.

## Other disks or deliberately limited scans

The default scope is the current user's home—not `/System`, other user accounts,
or mounted external volumes. Those locations are excluded because scanning the
whole macOS filesystem adds noise and crosses security boundaries without
finding ordinary user projects.

For an external project disk, run the CLI with an explicit colon-separated
scope before opening the pane:

```sh
FM_PROJECT_SCAN_ROOTS="$HOME:/Volumes/Work" \
  node "$plugin_root/project-fleet.mjs" --scan
```

Use only roots the current user owns and intends to expose as project names.
