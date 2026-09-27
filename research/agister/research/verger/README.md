# Verger orchestration research

Research from designing and building Verger, organized around the current
Agister orchestration design.

## Reading order

1. [Agister orchestrator](orchestrator.md) — current synthesis and proposed MVP.
2. [Verger build workflow](workflows/verger-build.yaml) — a concrete draft of
   the static, bounded workflow derived from the design and lessons.
3. [Parallel review example](workflows/review-code.yaml) — the minimal fan-out,
   fan-in and synthesis example from the configuration proposal.
4. [Adversarial review process](processes/adversarial-review.yaml) and
   [architecture review process](processes/architecture-review.yaml) — two
   concrete roles instantiated from the same agent profile.
5. [Reviewer agent profile](agents/reviewer.toml) — reusable model/runtime
   configuration shared by concrete review processes.
6. [Configuration proposal](proposals/ai-agent-orchestrator-proposal.md) — the
   task, workflow and process model from which the synthesis developed.
7. [Agent orchestration lessons](lessons/agent-orchestration.md) — consolidated
   evidence from the Verger design and build sessions.
8. [Build-loop orchestrator v3.4](prior-drafts/build-loop-orchestrator-v3.4.md) —
   the detailed implementation draft incorporated as the current document's
   illustrative profile.

## Directory guide

- `proposals/` contains conceptual proposals, their discussion and investigation
  material.
- `workflows/` contains concrete workflow drafts derived from the current model.
- `processes/` contains executable roles and policies referenced by workflows.
- `agents/` contains reusable runtime profiles referenced by processes.
- `prior-drafts/` contains superseded designs retained for provenance and detail.
- `lessons/` contains consolidated retrospectives and their supporting lesson
  passes.
- `source-notes/` contains prompts and intermediate session-reading notes. These
  are evidence, not current design authority.

The repository history preserves earlier revisions of each document. Files in
`prior-drafts/` are retained because they contain useful implementation detail,
not because every statement in them remains current.
