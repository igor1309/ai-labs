---
date: 2026-06-04
model: claude-opus-4-8
description: "Open task backlog and parked decisions for the traceability-review skill"
---

# Traceability Review — TODO

## Approach (direction)
- The skill is the product; the Agonara pipeline is the eval corpus, not a
  deliverable. Concrete findings matter only as evidence the method reasons well.
- Run each pass as an experiment. The payload is method behaviour fed back into
  `SKILL.md` / `references/` — a wobble is as valuable as a finding.
- Evals are **evaluated, not matched to the letter.** Judge whether the method
  reasoned soundly and reproduced *in spirit* — the verdict, the borderline calls,
  the row-generation discipline — not whether counts or prose match a golden file.
  Generative systems are non-deterministic; a fixed 100% outcome is neither the bar
  nor a proof the skill works on a different project.
- Don't chase breadth, depth, or completeness for its own sake. Run a module/shape
  only when it stresses the method in a new way; coverage is not a correctness guarantee.
- Lineage: a principled sibling to doc-drift-audit — ground truth is the upstream
  pipeline node, not the code.

## Candidates
- **Spec-level upward orphan check** — the active skill-development thread. Pass 7
  covers ADR→intent (every ADR decision traces back to a source intent); the
  spec→ADR/intent counterpart — does every spec clause trace back — is the natural
  extension if spec-level scope creep needs guarding. New SKILL content (version bump
  + `references/pass-notes.md` + publishing). Vocabulary grounded in
  `research/orphan-requirement-allocation-completeness.md`.
- **Further corpus experiments (optional, method-stress only)** — additional Agonara
  modules are worth running only for the new stress their *shape* puts on the method,
  not for coverage: **Assessment** 6/7 exercises dual ownership (one spec realizing
  both Corpus-side and Student-side of an ADR); **Student Workspace** exercises scale +
  async + 5-spec fan-out against the completeness invariant and the per-cluster split.
  Outputs are project-bound (`agonara/docs/traceability-reviews/`, no SKILL bump);
  evaluate the run, fold any wobble back into the skill, don't diff against a fixture.

## Parked
- **Publishing workflow** — when merging to trunk: `marketplace.json` + `plugin.json` bump, log entry, PR (per `dev-skills/.claude/CLAUDE.md`).
- **Hosting / triggering** — single vs multi agent; where it runs in anger.
- **CUR-13 refinement** — distinguish acceptance-time provenance from pre-acceptance visibility (the passes stably classify it allocated/carried; an arguable under-flag).
