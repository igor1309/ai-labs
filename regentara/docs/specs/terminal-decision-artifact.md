---
date: 2026-04-29
model: gpt-5
description: "Spec for Regentara terminal decision artifacts based on ADR-011."
---

# Terminal Decision Artifact Spec

## Goal

Regentara persists a policy-authored terminal decision artifact when `ReviewFixPolicy` ends the review-improvement loop.

## Public Interface

### ReviewFixPolicy Output

```text
ReviewFixPolicy.decide(input: ReviewFixPolicyInput) -> ReviewFixPolicyOutput
```

`ReviewFixPolicyOutput`:

- `decision`: `complete-ok`, `complete-fail`, or `remediate`.
- `session`: opaque policy session for the next policy decision.
- `reason`: optional concise terminal failure reason.
- `terminalArtifact`: optional terminal decision artifact.

`TerminalDecisionArtifact`:

- `content`: non-empty Markdown string authored by the policy.

### Run Output

When Regentara persists a terminal decision artifact, it writes:

```text
<run-directory>/terminal-decision.md
```

Terminal completion events and workflow results reference the persisted artifact by relative path:

```text
terminalArtifact: "terminal-decision.md"
```

## Behavior Rules

### Policy Output Validation

- `terminalArtifact` is optional.
- `terminalArtifact` is valid only with `complete-ok` or `complete-fail`.
- `terminalArtifact` must be rejected with `RuntimeFailure` when returned with `remediate`.
- `terminalArtifact.content` must be a non-empty string.
- Empty or non-string `terminalArtifact.content` must be rejected with `RuntimeFailure`.
- Regentara must not inspect, parse, normalize, or branch on `terminalArtifact.content`.

### Persistence

- Regentara must persist a returned terminal artifact as `terminal-decision.md` in the run directory.
- Regentara must preserve the policy-authored content exactly.
- Regentara must not overwrite an existing `terminal-decision.md`.
- Artifact persistence failure must fail the run with `RuntimeFailure`.
- Runs without a terminal artifact must preserve existing completion behavior.

### Terminal References

- On `complete-ok` with a terminal artifact, the workflow result must include `terminalArtifact: "terminal-decision.md"`.
- On `complete-fail` with a terminal artifact, the workflow result must include `terminalArtifact: "terminal-decision.md"`.
- Completion events for terminal decisions with artifacts must include `terminalArtifact: "terminal-decision.md"`.
- `complete-fail` must preserve existing `failureReason` semantics when `reason` is present.
- Startup failures and non-policy runtime failures must not fabricate a terminal decision artifact.

### Orchestrator Boundary

- The Orchestrator must receive terminal artifacts only through `ReviewFixPolicyOutput`.
- The Orchestrator must not know about Plan/Code phases to support terminal artifacts.
- The Orchestrator must not know about Git branches, worktrees, commits, or pull requests to support terminal artifacts.
- The Orchestrator must not encode Accept-or-Argue or other review-disagreement protocols.
- Policy session contents remain opaque to the Orchestrator.

## Tests (Required)

1. `runWorkflow` should persist `terminal-decision.md` when policy returns `complete-ok` with a terminal artifact.
2. `runWorkflow` should include `terminalArtifact: "terminal-decision.md"` in the successful workflow result when `complete-ok` includes an artifact.
3. `runWorkflow` should include `terminalArtifact: "terminal-decision.md"` in the completion event when `complete-ok` includes an artifact.
4. `runWorkflow` should persist `terminal-decision.md` when policy returns `complete-fail` with a terminal artifact.
5. `runWorkflow` should include `terminalArtifact: "terminal-decision.md"` in the failed workflow result when `complete-fail` includes an artifact.
6. `runWorkflow` should include `terminalArtifact: "terminal-decision.md"` in the completion event when `complete-fail` includes an artifact.
7. `runWorkflow` should preserve the policy-provided terminal artifact content exactly.
8. `runWorkflow` should fail with `RuntimeFailure` when policy returns `remediate` with a terminal artifact.
9. `runWorkflow` should fail with `RuntimeFailure` when `terminalArtifact.content` is missing, empty, or not a string.
10. `runWorkflow` should not write `terminal-decision.md` when policy returns a terminal decision without a terminal artifact.
11. `runWorkflow` should preserve existing `failureReason` behavior when `complete-fail` includes both `reason` and a terminal artifact.
12. `runWorkflow` should not inspect policy session contents while persisting a terminal artifact.
13. `runWorkflow` should not fabricate a terminal artifact for startup validation failures.
14. `runWorkflow` should not fabricate a terminal artifact for provider runtime failures before policy termination.

## Done Criteria

- `ReviewFixPolicyOutput` accepts optional policy-authored terminal artifacts for `complete-ok` and `complete-fail`.
- Regentara persists terminal artifacts as `terminal-decision.md` in the run directory.
- Workflow results and completion events reference persisted terminal artifacts by relative path.
- Invalid terminal artifact outputs fail with `RuntimeFailure`.
- The Orchestrator remains ignorant of Plan/Code phases, Git concepts, disagreement protocols, and policy session semantics.
- Required terminal artifact tests pass.
