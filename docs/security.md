# Security

Coding agents can read files, edit files, execute commands, start processes, and
make network requests with the permissions granted to the macOS user and the
harness. Herdr keeps those processes alive after you detach. Treehouse isolates
Git worktrees; it is not an operating-system sandbox.

FirstMate worker launch modes may intentionally use harness flags that bypass
interactive approval prompts so unattended workers can proceed. Read the
FirstMate operating contract and use a dedicated non-administrator account when
the risk warrants it.

## Never publish these materials

Do not add, copy, paste, stage, or commit:

- `auth.json`;
- OAuth access or refresh tokens;
- API keys;
- authorization headers or bearer values;
- Claude `.credentials.json` files;
- cookies or browser session state;
- macOS Keychain exports or screenshots;
- SSH private keys;
- `.env` files containing secrets;
- Codex, Claude, or Pi profile directories;
- terminal output containing an email, username, account identifier, quota
  amount, or personal absolute path unless it is deliberately sanitized.

Directory names such as `$HOME/.codex-account1` are safe documentation
conventions. Their contents are not repository material.

## Environment variables do not copy credentials

The wrappers set a path selector:

```sh
export CODEX_HOME="$HOME/.codex-account1"
```

or:

```sh
export CLAUDE_CONFIG_DIR="$HOME/.claude-account1"
```

They do not embed a token. The selected vendor CLI reads its own existing store
using its normal credential management. Keep the wrapper generic and use
`"$@"` so arguments are preserved without evaluation.

## Repository ignore boundary

This repository's `.gitignore` blocks common credential filenames and profile
directory patterns. An ignore rule is a backstop, not proof of safety: a file
already tracked by Git remains tracked, and an unusual secret filename may not
match.

Never use force-add to bypass a credential ignore rule.

## Safe verification behavior

The verification scripts:

- use login status or Boolean JSON fields rather than printing account details;
- query quota with `--no-credential-refresh`;
- do not request credential-bearing/full output;
- reduce Herdr integration results to current/not-current status;
- never open or copy profile authentication files;
- sanitize `$HOME` paths where paths are shown.

The one-time Claude `--allow-keychain-prompt` command is an explicit setup step,
not part of unattended verification.

## Before every public push

Run from the repository root:

```sh
git status
git diff --cached
git grep -nEi 'api[_-]?key|token|secret|password|authorization|bearer'
./scripts/check-publication.sh
```

The generic-word grep will intentionally match this security documentation.
Inspect every match in context; do not treat the existence of documentation
words as a secret by itself.

Also inspect tracked filenames:

```sh
git ls-files | grep -Ei \
  'auth\.json|(^|/)\.env($|\.)|credentials|cookies|private|\.pem$|\.p12$|\.key$'
```

No output is expected except deliberately reviewed documentation/source names.

The publication checker fails on high-confidence private-key/key/token shapes,
credential-like filenames, personal absolute macOS home paths, and unreplaced
publication placeholders. For generic security words it prints only
`file:line`, not the matched value.

## Sanitize build logs

Replace a personal absolute home-directory path with its portable form:

```text
$HOME/.codex-account1
```

Retain only the small part of command output that establishes the result. Never
paste an entire environment, Keychain record, authentication JSON object, or
debug log into the build log.

Quota amounts and account identities are private operational data. Record only
classifications such as `fresh`, `stale`, `authenticated`, or `not
authenticated` when that is enough to prove the behavior.

## Review downloaded installers and source

This guide uses official network installers for Homebrew, NVM, Herdr, Treehouse,
and No Mistakes. A pipe-to-shell command executes current remote content with
your user's permissions. The documented URLs were verified against official
project documentation, but you may download and inspect a script before running
it.

Pi project trust allows tracked extensions in the FirstMate clone to execute.
Inspect the clone and its revision before approving trust. Rerun the review after
an upstream update.

## Patch provenance

`patches/firstmate-forward-codex-home.patch` changes one FirstMate worker launch
boundary. It does not read credentials; it forwards the already-selected
`CODEX_HOME` path as an environment prefix. The patch is tied to an audited
FirstMate commit and must be re-reviewed if upstream source changes.

## Incident response

If a secret is ever committed:

1. stop publication;
2. revoke or rotate the credential at its provider;
3. remove it from the current tree and Git history using an appropriate
   history-rewrite procedure;
4. rescan the complete repository and any forks/remotes;
5. do not assume deleting the latest file makes a published secret safe.

History rewriting and force-pushing are destructive operations and are outside
the automatic workflow in this repository. Perform them only with explicit
authorization and a reviewed recovery plan.
