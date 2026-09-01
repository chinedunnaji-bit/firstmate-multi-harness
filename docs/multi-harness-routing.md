# Multi-harness routing

The Pi coordinator remains the single FirstMate liaison while FirstMate can
spawn Pi, Codex CLI, or Claude Code as task workers.

## Verified harness identifiers

At audited FirstMate commit
`6c1d2db194cb20e08232ba2fa2c414592f724b44`, verified identifiers were:

```text
claude
codex
opencode
pi
pi-signed
grok
kimi
cursor
```

`muse` was available for crewmates/scouts only. This repository's configuration
uses only `pi`, `codex`, and `claude`.

Account labels such as `codex1`, `codex2`, `claude1`, and `claude2` are not
harness identifiers.

Source: [FirstMate operating contract](https://github.com/kunchenguid/firstmate/blob/6c1d2db194cb20e08232ba2fa2c414592f724b44/AGENTS.md#4-harness-and-runtime-dispatch).

## Configuration surfaces

### `config/crew-harness`

This is a static, local, gitignored fallback containing one bare adapter name.
Absent or `default` means the coordinator's own harness.

This setup intentionally leaves it absent. Writing `pi` there would make Pi the
static worker fallback and would work against the goal of classifying tasks
across all three harnesses.

### `config/crew-dispatch.json`

This is the dynamic, local, gitignored dispatch profile file. Its current
canonical shape is:

```json
{
  "rules": [
    {
      "when": "a natural-language task condition",
      "use": {
        "harness": "codex",
        "model": "optional model",
        "effort": "optional effort"
      },
      "why": "optional rationale"
    }
  ],
  "default": {
    "harness": "pi"
  }
}
```

Each `use` and the top-level `default` can be either one profile object or a
nonempty array. Every profile requires `harness`; `model` and `effort` are
optional.

FirstMate itself judges the natural-language conditions. The shell scripts do
not match the rules. They validate the schema and receive only the concrete
harness/model/effort that the coordinator selected.

Source: [FirstMate dispatch profile schema](https://github.com/kunchenguid/firstmate/blob/6c1d2db194cb20e08232ba2fa2c414592f724b44/docs/configuration.md#crew-dispatch-profiles-configcrew-dispatchjson).

### `config/secondmate-harness`

This primary-only local file configures persistent secondmates, not ordinary
workers. Its form is:

```text
<harness> [<model>] [<effort>]
```

When absent or `default`, resolution falls through `config/crew-harness` and
then the coordinator harness. Secondmate homes inherit `crew-dispatch.json` and
a literal `crew-harness`, but not `secondmate-harness`.

This repository does not configure secondmates in the clean path.

## Dispatch precedence

For an ordinary crewmate or scout, the audited precedence is:

1. an explicit per-task captain override;
2. the best fitting `rules[].when` entry;
3. the top-level `default` profile;
4. static `config/crew-harness`;
5. the coordinator's detected harness.

Explicit model and effort values follow the same intent: a per-task explicit
value overrides the selected profile; an omitted axis lets the harness use its
own default.

When `crew-dispatch.json` exists, `fm-spawn.sh` refuses a crewmate or scout
spawn that lacks an explicit resolved harness. This fail-closed boundary prevents
a caller from silently skipping profile consultation. Secondmate spawns remain
exempt and use their separate resolution path.

## Tested configuration

The repository's `examples/crew-dispatch.json` selects:

| Task class | Harness | Effort |
| --- | --- | --- |
| Implementation, debugging, test repair, multi-file refactor | Codex | high |
| Architecture/adversarial review and long-form technical writing | Claude | high |
| Coordination, triage, bounded research, documentation synthesis | Pi | medium |
| No matching rule | Pi | medium |

Models are deliberately omitted. Model identifiers change independently and the
audit host did not yet have a Pi credentialed model catalog. This avoids
publishing invented or stale model names as a clean default.

Validation command:

```sh
cd "$HOME/src/firstmate"
FM_BOOTSTRAP_DETECT_ONLY=1 \
FM_BOOTSTRAP_NETWORK=skip \
FM_BOOTSTRAP_VERBOSE_FACTS=1 \
  bin/fm-bootstrap.sh
```

The audited configuration produced one active fact per rule and no dispatch
error.

## Model and effort mapping

Installed help and FirstMate's verified adapters showed:

| Harness | Model axis | Effort axis |
| --- | --- | --- |
| Claude Code | `--model` | `--effort low|medium|high|xhigh|max` |
| Codex CLI | `--model` | FirstMate maps low/medium/high/xhigh to `model_reasoning_effort`; unsupported `max` is omitted |
| Pi | `--model` | `--thinking`; current Pi help also lists off/minimal plus low/medium/high/xhigh/max |

Discover models from the authenticated harness rather than guessing:

```sh
pi --list-models
codex
claude
```

For Codex and Claude, use each interactive harness's model selector/help. Keep
profile model values absent until the exact identifier is confirmed in the
selected account.

## Quota-array dispatch

A profile array asks FirstMate to choose among alternatives using the
`quota-array-dispatch` procedure. The coordinator must:

1. establish each candidate's verified harness and provider relationship;
2. query current `quota-axi` evidence, using its normal compact output first;
3. account for every candidate, including missing or stale evidence;
4. preserve the strongest reasoning class required by the task;
5. check completion/runway feasibility;
6. rank comparable candidates by the highest known `spendPriority`;
7. stop for a genuine unresolved tie rather than inventing a preference.

`quota-axi` is data-only. It explicitly does not route, rank a winner, or launch
a harness. FirstMate is the consumer that makes the contextual decision.

Current limitation: the default repository configuration uses single profile
objects. Pi still requires authentication and only the primary Codex/Claude
accounts currently have fresh quota evidence, so an end-to-end live array choice
has not been claimed.

Sources: [FirstMate quota-array skill](https://github.com/kunchenguid/firstmate/blob/6c1d2db194cb20e08232ba2fa2c414592f724b44/.agents/skills/quota-array-dispatch/SKILL.md),
[quota-axi selection signal](https://github.com/kunchenguid/quota-axi#per-scope-selection-signal).

## Explicit overrides

An explicit captain instruction can select a verified harness for one task. The
coordinator then passes the concrete selection with `--harness` to
`fm-spawn.sh`. This does not rewrite the dispatch file.

Use explicit overrides for initial controlled verification, not account aliases:

```text
Use the Codex worker harness for this scout.
Use the Claude worker harness for this scout.
Use the Pi worker harness for this scout.
```

Do not request `harness=codex1`; select the `codex` harness and route the account
underneath it.

## Invalid configuration behavior

The following real failures were verified:

Malformed JSON:

```text
CREW_DISPATCH: invalid config/crew-dispatch.json - malformed JSON
```

Shell account name used as a harness:

```text
CREW_DISPATCH: invalid config/crew-dispatch.json - unverified harness: codex1
```

While an invalid file remains present, do not dispatch around it. Correct the
file and rerun bootstrap. FirstMate's operating contract requires profile-based
dispatch to stop rather than silently fall back.
