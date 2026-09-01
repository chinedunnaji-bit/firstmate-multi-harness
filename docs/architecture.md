# Architecture

This stack separates orchestration, terminal persistence, code isolation,
provider capacity, command-line harnesses, models, and account identities. They
are related, but none is interchangeable with another.

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

## Layer map

| Layer | Component | Responsibility |
| --- | --- | --- |
| Model | GPT, Claude, and other provider models | Produces model output; selected inside a harness or by a FirstMate dispatch profile. |
| Harness | Pi, Codex CLI, Claude Code | Runs an interactive or autonomous coding-agent process. |
| Orchestrator | FirstMate | Classifies work, prepares task state, selects a verified harness profile, supervises workers, and reconciles completion. |
| Session backend | Herdr | Keeps terminal panes/sessions alive and exposes agent/session state. |
| Code isolation | Treehouse | Leases reusable Git worktrees so workers do not edit the same checkout. |
| Account routing | This repository's wrappers and documented profile convention | Selects an isolated vendor configuration directory without copying credentials. |
| Provider capacity | `quota-axi` | Reports quota evidence; it does not launch agents or choose an account by itself. |
| Delivery gate | No Mistakes, when the selected FirstMate project mode uses it | Runs a guarded validation and publication pipeline in an isolated worktree. |

FirstMate is an agent distribution, not a `firstmate` executable. A clone's
`AGENTS.md`, scripts, skills, data, and state conventions turn a supported
primary harness into the coordinator. The current upstream quick start launches
the chosen primary harness from the FirstMate clone.

Sources: [FirstMate repository](https://github.com/kunchenguid/firstmate),
[FirstMate architecture](https://github.com/kunchenguid/firstmate/blob/6c1d2db194cb20e08232ba2fa2c414592f724b44/docs/architecture.md).

## Control flow

1. The user talks to Pi while Pi is running from the FirstMate clone.
2. FirstMate reads the task and applies explicit instructions and
   `config/crew-dispatch.json`.
3. FirstMate passes a concrete verified harness, optional model, and optional
   effort to `bin/fm-spawn.sh`.
4. The Herdr backend creates the worker's terminal endpoint.
5. Treehouse leases a clean worktree for a ship or scout task.
6. The worker harness runs against that worktree.
7. FirstMate watches durable state and the backend, then reconciles the result.

Herdr supplies the terminal/session layer; it does not replace Treehouse.
FirstMate's current Herdr backend documentation calls that backend experimental
and requires Herdr protocol 14 or newer. The audited Herdr 0.8.2 installation
meets FirstMate's 0.8.0 presentation-space floor.

Source: [FirstMate Herdr backend](https://github.com/kunchenguid/firstmate/blob/6c1d2db194cb20e08232ba2fa2c414592f724b44/docs/herdr-backend.md).

## Harness dispatch versus account dispatch

FirstMate recognizes harness identifiers such as `pi`, `codex`, and `claude`.
It does not recognize shell account names such as `codex1` or `claude2` as
harness identifiers. A tested invalid dispatch containing `"harness":"codex1"`
was rejected as an unverified harness.

Therefore the intended layering is:

```text
FirstMate profile { harness: "codex" }
                │
                ▼
          Codex account layer
                │
        ┌───────┼────────┐
        ▼       ▼        ▼
     codex1   codex    codex2
```

The fixed and basename-driven executable wrappers in `examples/` provide
explicit, automation-safe profile selection. They set only a
configuration-directory environment variable and then execute the real harness
with the original argument vector.

Account Fleet is the local control surface for this additional layer:

```text
                       Herdr terminal UI
                              │
                              ▼
                     Account Fleet overlay
                    sanitized registry/checks
                              │
                  primary / active / retired
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
       CODEX_HOME selector          CLAUDE_CONFIG_DIR selector
               │                             │
               ▼                             ▼
        FirstMate Codex worker        FirstMate Claude worker
```

The overlay is a Herdr v1 terminal-pane plugin, not a native sidebar extension.
It never becomes a harness identifier and does not change
`crew-dispatch.json`. `scripts/launch-firstmate.sh` consumes its primary
selections at the coordinator boundary.

Current verified boundary:

- `codex1` and `claude1` are authenticated and return fresh isolated quota
  evidence.
- The default and account2 profiles are optional and are not all quota-ready.
- Automatic quota-aware selection across accounts is therefore not claimed as
  working yet. It requires at least two usable profiles and a tested router
  beneath the recognized harness name.

See [multi-account routing](multi-account-routing.md) for the exact status and
the safe next architecture, [Account Fleet UI](account-ui.md) for the visual
control plane, and [account lifecycle](account-lifecycle.md) for explicit
credential/profile cleanup.

## Capacity is evidence, not an account alias

`quota-axi` reads the selected Codex directory through `CODEX_HOME` and the
selected Claude directory through `CLAUDE_CONFIG_DIR`. Each account must be
queried separately. Its selection signal (`spendPriority`) is evidence a
consumer can compare; `quota-axi` does not route or launch a process.

FirstMate's profile arrays use `quota-array-dispatch` to reason over harness and
provider candidates. That current mechanism is not an account-alias registry.

Source: [quota-axi repository](https://github.com/kunchenguid/quota-axi).

## Security boundaries

- Each harness runs with the filesystem and process permissions of the macOS
  user that launched it.
- Herdr keeps processes alive; detaching does not revoke their permissions.
- Treehouse isolates Git worktrees, not operating-system privileges.
- Profile wrappers select existing credential stores; they never copy or print
  credentials.
- FirstMate worker launch modes may deliberately bypass harness approval prompts
  for autonomous work. Review FirstMate's operating contract and project mode
  before dispatching.

See [security](security.md) before using the stack on sensitive repositories.
