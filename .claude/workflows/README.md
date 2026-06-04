---
date: 2026-06-04
model: claude-opus-4-8
description: "Project dynamic workflows — what's here and how to run/reuse them"
---

# Project Workflows

Dynamic workflows for this repo. Each `.js` file here is a saved workflow that
runs as `/<name>` and is shared with everyone who clones the repo. A workflow is a
script the runtime executes (Claude authors it from a prompt; saved via `s` in
`/workflows` after a good run, then generalized to be `args`-driven).

## `traceability-review.js` → `/traceability-review`

Runs the `traceability-review` skill as a workflow over **one module per run**:
slice the module once → fan out the passes (ADR→spec, spec↔tests, orphan) from the
slice → reduce to an umbrella ledger. One module per run because a whole-project
run exceeds the session token budget.

**Args:** `{ projectRoot, module, skillDir? }`
- `projectRoot` — the project to review (e.g. the `agonara/` dir).
- `module` — the slice to run; the workflow's slice agent locates that module's
  ADRs/specs/tests itself from the module responsibility map (nothing hardcoded).
- `skillDir` — optional; where the skill's `SKILL.md` + `references/` live. Defaults
  to the skill as a sibling of `projectRoot` (correct in this repo); set it for
  other installs.

### Run it (interactive)

```
Run /traceability-review on {projectRoot: "<repo>/agonara", module: "Program Membership"}
```

To cover a whole project: first get the **slice plan** (a plain ask, not a workflow) —

```
Read the module responsibility map under <projectRoot> and list each module with its
ADRs, specs, and test files. Don't run any passes.
```

— then fire `/traceability-review` once per module from that list.

### Reuse it programmatically (from an agent/script)

Invoke the saved workflow by name with args:

```
Workflow({ name: "traceability-review", args: { projectRoot: "<repo>/agonara", module: "Program Membership" } })
```

Same saved script — supply `args`, don't re-author. (`{ scriptPath, args }` also works.)

### Precondition

Discovery leans on the My-Way topology — a module responsibility map plus a
module-decomposed ADR/spec/test layout (the `traceability-review` skill's stated
precondition). It holds for Agonara and any project of that shape, not arbitrary repos.

### Output

The skill's contract is to write findings to `<project>/docs/traceability-reviews/`.
Dev/eval runs are returned to the caller, not committed into the project; frozen
reference copies live under `dev-skills/public/traceability-review/evals/`.
