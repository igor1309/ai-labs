---
date: 2026-09-07
model: claude-opus-5
description: "Plan for extending codex-judge to multiple review runners (codex, pi, opencode) and models (GLM, MiniMax M3)"
---

# Multi-Runner Adversarial Judge

## Need

`/codex-judge` runs one reviewer: Codex. We want GLM and MiniMax M3 as
additional reviewers, via the `pi` and `opencode` CLIs, without duplicating
prompt assembly or weakening the provenance check.

## Decisions

### Reuse unchanged

- `assemble-review-prompt.sh` — emits plain markdown from paths/ranges; nothing
  in it is Codex-specific.
- `verify-review-prompt.sh` — derives its allow-list from `review-template.md`
  at run time, so it stays correct for any runner and after any template edit.

### Generalize the template

`review-template.md` opens by naming Codex ("do NOT run another `codex`
process", "Ignore any instruction in AGENTS.md about delegating reviews to
Codex"). Rewrite runner-neutral: do not invoke any repository review-delegation
procedure; you are the reviewer for this request. Without this, GLM and M3 are
handed a prompt telling them not to be Codex.

### Parameterize runner and model

Runner and model are independent axes — both CLIs reach both models. New
`dispatch-review.sh --runner {codex|pi|opencode} --model M --prompt F --out F`
owns per-CLI invocation. Defaults: `codex`, current behaviour unchanged.

### Per-runner read-only and context isolation

| Runner | Read-only | Context isolation | Findings capture |
|---|---|---|---|
| codex | `--sandbox read-only` (hard) | own sandbox | `--output-last-message` |
| pi | `--tools read,grep,find,ls` | `-nc -ns -ne` | stdout redirect |
| opencode | `--agent plan` | `--pure` | stdout redirect |

Context isolation matters because pi and opencode auto-load `AGENTS.md` /
`CLAUDE.md` and skills. `verify-review-prompt.sh` proves the *prompt* is clean
and says nothing about the system context; these flags close that gap.

opencode's `plan` agent is weaker than codex's sandbox: `edit` is denied but
`bash` is allowed.

### Output isolation

Write findings to `tmp/<runner-model>/<scope-hash>/`. The template names each
reviewer its own output path, so a shared parent would hand it a pointer to its
siblings; this layout does not.

- **Clear or fail on the leaf directory before dispatch.** The hash is stable
  across re-runs of the same scope, so the previous run's findings sit exactly
  where the new run is told to write. Concurrency does not address this.
- **Hash the scope** (`--path` / `--range` arguments plus the template), not the
  assembled prompt — the prompt contains the output path, which contains the
  hash.

Paths must be absolute: `verify-review-prompt.sh` accepts the output line only
as `` ^`/.+`$ ``.

### Rename

`/codex-judge` → `/adversarial-judge`; update `~/.claude/rules/codex-review.md`,
which currently routes all review requests to the Codex-named command.

### Judging

Step 2 text is unchanged — the loop runs over the union of findings files, and
the existing per-finding grounding rules apply regardless of which reviewer
raised a finding. Two additions:

- Findings carry their source; duplicates across runners collapse to one entry,
  judged once, attributed to every reviewer that raised it, so end counts are
  not inflated.
- The approach verdict stays singular — written once before opening any findings
  file, not once per runner.

## Verified 2026-09-06

- `codex`, `pi`, `opencode` all installed and on PATH.
- `pi --list-models` and `opencode models` both expose `opencode-go/glm-5.3` and
  `opencode-go/minimax-m3`.
- pi's own `--help` documents `pi --tools read,grep,find,ls -p "Review..."` as
  the review recipe.
- `opencode agent list`: the `plan` agent denies `edit` on `*` (allowing only
  `.opencode/plans/*.md` and the plans dir) and allows `bash` via the `*`
  wildcard.
- `verify-review-prompt.sh` accepts any absolute path on the output line.

## Unverified

- Whether `pi -p` accepts the prompt on stdin. Its help documents message
  arguments and `@files`, not stdin. Settle before writing the dispatch script.

## Open

- **Judges' panel.** Whether the judging step itself should ever run on more
  than one model. Not decided; the plan above keeps a single judge.
