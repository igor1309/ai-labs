# Verger orchestration research

Research from designing and building Verger, organized around the current
Agister orchestration design.

## Reading order

1. [Agister orchestrator](orchestrator.md) — current synthesis and proposed MVP.
2. [Functional requirements](functional-requirements.md) — capabilities derived
   from the Verger operational lessons without fixing implementation details.
3. [Advance-goal workflow](workflows/advance-goal.yaml) and
   [execute-task workflow](workflows/execute-task.yaml) — compact illustrations
   of the boundary between goal progression and task execution.
4. [Parallel review example](workflows/review-code.yaml) — a structured parallel
   review stage followed by synthesis.
5. [Adversarial review process](processes/adversarial-review.yaml) and
   [architecture review process](processes/architecture-review.yaml) — two
   concrete roles sharing one process policy and agent profile.
6. [Static-review process policy](policies/static-review.yaml) — shared,
   narrowing-only execution policy for review roles.
7. [Reviewer agent profile](agents/reviewer.toml) — reusable model/runtime
   configuration shared by concrete review processes.
8. [Agent orchestration lessons](lessons/agent-orchestration.md) — consolidated
   evidence from the Verger design and build sessions.
9. [Build-loop orchestrator v3.4](prior-drafts/build-loop-orchestrator-v3.4.md) —
   the detailed implementation draft incorporated as the current document's
   illustrative profile.
10. [Configuration proposal](proposals/ai-agent-orchestrator-proposal.md) — an
   earlier conceptual exploration retained as provenance, not current authority.

## Directory guide

- `proposals/` contains conceptual proposals, their discussion and investigation
  material.
- `workflows/` contains concrete workflow drafts derived from the current model.
- `processes/` contains executable roles referenced by workflows.
- `policies/` contains reusable process execution policy with narrowing-only
  composition.
- `agents/` contains reusable runtime profiles referenced by processes.
- `prior-drafts/` contains superseded designs retained for provenance and detail.
- `lessons/` contains consolidated retrospectives and their supporting lesson
  passes.
- `source-notes/` contains prompts and intermediate session-reading notes. These
  are evidence, not current design authority.

The workflow files are conceptual illustrations rather than complete runnable
bundles or proposed exhaustive schemas. They optimize for visible
responsibilities and interfaces; bindings, failure permutations and much policy
detail are intentionally omitted. Registry-style identifiers show boundaries,
and only the review processes relevant to the configuration example are defined
in this directory.

The repository history preserves earlier revisions of each document. Files in
`prior-drafts/` are retained because they contain useful implementation detail,
not because every statement in them remains current.
