---
date: 2026-06-27
model: gpt-5
description: "Adversarial review of the material content storage implementation plan against ADR-021, its spec, and mandatory implementation-plan structure."
---

# Material Content Storage Plan — Adversarial Review

## Scope

Reviewed `agonara/docs/plans/material-content-storage.md` plus the changed backlog
and log entries in this branch. The review checked the plan against
`docs/my-way/05-implementation-plan/structure.md`, the `implementation-plan`
acceptance checklist, ADR-021, and `agonara/docs/specs/material-content-storage.md`.

## Findings

### Final closeout required fields

- **Verdict:** fail, fixed.
- **Location:** `agonara/docs/plans/material-content-storage.md:342`
- **Why:** The mandatory implementation-plan structure requires `## Final closeout`
  to declare `Final gates`, `Archive plan`, `Commit archive move`, and `Push/PR`.
  The plan had the section, but only as prose bullets. That failed the process-gate
  rule that scattered equivalent bullets do not substitute for required headings or
  fields, and it weakened closeout enforcement for the archive commit.
- **Fix:** Replaced the bullets with explicit `Final gates`, `Archive plan`,
  `Commit archive move`, and `Push/PR` declarations.
- **Tests:** No executable tests required; verified by inspecting the plan structure
  and running `git diff --check`.

### Declaration block validity

- **Verdict:** pass.
- **Location:** `agonara/docs/plans/material-content-storage.md:20`
- **Why:** The execution declarations include legal values for `Mode`, human-review
  behavior, `Worktree mode`, `Push policy`, expected worktree/branch, and unchecked
  authoring-time preflight. No phase declares its own worktree, branch, or push
  policy.
- **Fix:** None required.
- **Tests:** Structure inspection only.

### ADR-021 and spec fidelity

- **Verdict:** pass.
- **Location:** `agonara/docs/plans/material-content-storage.md:34`
- **Why:** The scope guardrails and phase work preserve ADR-021's core invariants:
  source raw content is curator-only and hard-deletable, accepted material content
  is a self-contained immutable revision copy, student reads are accepted-content
  only, licensing is not gated, navigation stays content-free, and ADR-022
  withdrawal/source-record deletion is explicitly excluded.
- **Fix:** None required.
- **Tests:** Cross-checked against `agonara/docs/adr/adr-021-material-content-storage-and-role-gated-reading.md`
  and `agonara/docs/specs/material-content-storage.md`.

### Verification coverage

- **Verdict:** pass.
- **Location:** `agonara/docs/plans/material-content-storage.md:119`
- **Why:** The targeted commands cover storage, domain, HTTP, backup/restore,
  browser, full Agonara tests, root build, and whitespace checks. Phase validation
  repeats the relevant targeted command plus the full suite/build gate, matching
  the repo's Node/TypeScript verification wrapper rule.
- **Fix:** None required.
- **Tests:** Confirmed Node `v22.21.1` exists at the path used by the plan and
  `agonara/package.json` declares `engines.node >=22`.

### Backlog and log consistency

- **Verdict:** pass.
- **Location:** `agonara/backlog/material-content.md:24`,
  `agonara/docs/log.md:5`
- **Why:** The backlog now removes the forward task to draft a plan and points
  implementation work at the plan. The log records the plan and this review/fix
  as outcomes rather than session status.
- **Fix:** None required.
- **Tests:** File inspection only.

## Verification

- `sed -n '1,320p' docs/my-way/05-implementation-plan/structure.md` — confirmed
  the required implementation-plan sections and final-closeout fields.
- `sed -n '1,320p' dev-skills/public/implementation-plan/SKILL.md` — confirmed
  legal declaration values and task/phase vocabulary.
- `sed -n '1,320p' dev-skills/public/process-gates/SKILL.md` and
  `sed -n '1,320p' .agents/process-gates.md` — confirmed plan-review and
  pre-push gate requirements.
- `nl -ba agonara/docs/plans/material-content-storage.md` — reviewed changed
  plan content with line numbers.
- `nl -ba agonara/docs/specs/material-content-storage.md` and
  `nl -ba agonara/docs/adr/adr-021-material-content-storage-and-role-gated-reading.md`
  — cross-checked plan scope against the accepted ADR and spec.
- `ls -la $HOME/.nvm/versions/node/v22.21.1/bin/node ...` and
  `$HOME/.nvm/versions/node/v22.21.1/bin/node --version` — confirmed the plan's
  pinned Node path exists and reports `v22.21.1`.
