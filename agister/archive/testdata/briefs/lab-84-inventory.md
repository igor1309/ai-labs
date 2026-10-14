# LAB-84 inventory: home and `.agister/`, observed 2026-10-07

## Goal

`agister/testdata/briefs/lab-84-goal.md`

## What it is

The dated inventory and migration observations ADR-027 rests on, moved
out of the ADR's Context (adr_review `20261007T184903Z-67ed25`). The
implementation step reads it to fill `agister/home/` (ADR-027 rule 2)
and to remove from `.agister/` what the folder holds (rule 6). It
records what was there on 2026-10-07; check it against `~/.agister/` and
`.agister/` before acting on it.

## Home (`~/.agister`)

- Holds 7 agents, 2 brief forms, 5 policies, 12 processes, 8 prompts,
  3 runtimes, 4 schemas, 2 workflows and `service.toml`. It has no
  `skills/`, no `verifies/` and no `blocks.yaml`.
- Beside them is live state: `runs/`, `logs/`, `locks/`, `backups/`,
  `cache/`, `pi/sessions/` and `.write.lock`.
- No agent names a `command`, so no settings document holds a path of
  this machine except the eight absolute prompt paths below.
- No settings skill is in `~/.agister/skills/`: `agister install <dir>`
  reports a folder's `skills/` as not settings (ADR-016 rule 1, ADR-021's
  non-decisions).

## Home's prompts against `prompts/`

Home's eight prompts are hand copies of the repository's `prompts/`.
Six are identical; two differ:

- `advisor.md`: home's speaks of "the project's decisions record", the
  repository's of `agister/docs/decisions.md`. **Home's is current.**
- `code-review-clarity.md`: the repository's is version 0.0.6, with the
  done-gate exception to its item 9; home's is 0.0.5. **The repository's
  is current.**

## Home's processes

The eight review, judge and advisor processes read their prompts by
absolute path, `{source: file, path: /Users/.../.agister/prompts/<name>.md}`,
which no other machine has (ADR-014's context).

## The repository's `.agister/` against home

`.agister/` holds 38 documents. Of those home also has, these are
identical: 7 agents, 2 brief forms, 5 policies, the `codex` and `pi`
runtimes, 3 schemas and `workflows/adr_review.yaml`.

The rest differ, and the current copy of each is:

- **The eight review, judge and advisor processes** read their prompts by
  a path relative to the caller, `prompts/<name>.md`, found only in this
  repository. Current: neither path; the folder's takes the prompt as a
  settings prompt (ADR-027 rule 4), otherwise the text they share.
  `advisor.yaml`'s header comment: home's generic one.
- **The four `implement*` processes**: `.agister/`'s have the instruction
  written for ADR-025 ("in this worktree … your changes stay here") and
  name the two Go prompts as optional (ADR-019); home's still have the
  older instruction and no Go prompts. Current: `.agister/`'s.
- **`schemas/advice.json`**: `.agister/`'s names
  `agister/docs/decisions.md` where home's is generic, as with
  `advisor.md`. Current: home's; `.agister/`'s leaves it, as every
  shared document does (ADR-027 rule 6).
- **`service.toml`** differs from home's only in a comment. Current:
  home's.
- **`workflows/code_review.yaml`** differs only in how a comment wraps.
  No copy was named current; the folder takes either, and `.agister/`'s
  leaves it (ADR-027 rule 6).

Only `.agister/` has `verifies/repo.yaml` and `prompts/go-*.md`, the
latter copies of `prompts/go-*.md` that a test keeps identical. Only home
has `runtimes/claude-code.yaml`.
