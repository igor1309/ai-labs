---
date: 2026-04-29
model: gpt-5
description: "Comparison of Regentara with the codex-review Claude plugin and corrected recommendations"
source: https://github.com/artwist-polyakov/polyakov-claude-skills/tree/main/plugins/codex-review/skills/codex-review
source_commit: b8e4bbe
---

# Codex Review Plugin Comparison

## Summary

`codex-review` is a Claude Code plugin and shell workflow for one concrete collaboration pattern:

- Claude implements.
- Codex reviews.
- The workflow has separate plan and code review phases.
- The plugin stores branch-scoped review state under `.codex-review/`.
- Codex writes a simple terminal verdict: `APPROVED` or `CHANGES_REQUESTED`.

Regentara is a different abstraction. It is not a Claude/Codex review plugin and should not copy that workflow shape. Regentara coordinates provider agents over a single primitive: a verifiable task. The task is intentionally opaque to the Orchestrator. A plan may be inside the task, but the Orchestrator should not know whether the task is a plan, a fix request, a migration step, or any other verifiable instruction.

The useful comparison is not that Regentara should borrow `codex-review` phases. The useful comparison is that a review loop needs a durable terminal explanation when the review policy decides to stop improving.

## Codex Review Shape

`codex-review` is optimized for immediate operator ergonomics inside Claude Code.

Its workflow is:

1. Initialize or resume a Codex reviewer session.
2. Submit a plan file for review.
3. Implement after the plan is approved.
4. Submit a code-change description for review.
5. Iterate until Codex writes `APPROVED`, requests changes, or the configured iteration limit is exhausted.

The plugin persists workflow state under `.codex-review/`, isolated by branch. It stores status, verdict, logs, and review notes. In auto-review mode, a Claude plugin hook can block plan-mode exit until Codex has approved the plan.

This is coherent for a Claude Code plugin because it owns user workflow ergonomics around Claude sessions, Codex sessions, plan approval, code review, and branch-local state.

## Regentara Shape

Regentara is optimized as a generic orchestration substrate.

Its workflow is:

1. Producer receives the current verifiable task and returns a structured completion claim.
2. Reviewer receives the task and Producer output and returns a structured verdict.
3. `ReviewFixPolicy` receives the verdict plus opaque policy session state and returns a routing decision.
4. On `remediate`, Remediator receives the task, Producer output, latest verdict, and review history, then returns a new verifiable task.
5. The loop repeats with the remediated task.

The Orchestrator must remain ignorant of the internal task shape. A plan is a possible task payload, not an orchestration phase. The Producer can implement a plan, and the Reviewer can judge whether the Producer implemented that plan well, but those are agent responsibilities.

The Orchestrator also should not know about branches or worktrees. It works within a selected workspace. A branch may be the most common workspace implementation detail for coding tasks, but branch awareness belongs outside the Orchestrator boundary.

## Overlap

Both systems involve cross-agent review and iterative improvement:

- one agent produces work
- one agent reviews work
- review feedback can drive another iteration
- an iteration budget can stop the loop
- runtime artifacts can preserve what happened

The overlap ends at that control-loop level. `codex-review` is a specific Claude/Codex workflow. Regentara is a policy-driven orchestration model where task semantics, review artifacts, and workspace mechanics remain delegated.

## Incorrect Initial Recommendation

The initial recommendation was that Regentara could borrow:

- Plan and Code phases
- branch-scoped review notes
- stale verdict protection
- explicit `APPROVED` / `CHANGES_REQUESTED` verdicts
- an Accept-or-Argue remediation protocol

That recommendation is too coupled to the `codex-review` plugin's workflow and would weaken Regentara's abstraction boundaries.

## Corrected Recommendations

### Do Not Add Plan And Code Phases To Regentara

Regentara's unit is a verifiable task. Adding Plan and Code as Orchestrator-level phases would leak a specific implementation workflow into the generic loop.

If a plan matters, it should be part of the task handed to the Producer. The Reviewer can then evaluate whether the Producer satisfied the task, including whether the plan was followed. The Orchestrator should only coordinate agents and policy decisions.

### Do Not Make The Orchestrator Branch-Aware

Branch-scoped review notes are useful in `codex-review` because the plugin is a Claude Code workflow tool running inside Git-oriented coding sessions.

Regentara should stay workspace-oriented. It should not assume Git, branches, worktrees, commits, or pull requests. If durable review notes matter, that requirement belongs in the task, reviewer prompt, artifact policy, or provider-agent behavior.

For example, the Reviewer can be instructed to produce or commit a review artifact that survives the run cycle. That does not require the Orchestrator to understand branches.

### Do Not Encode Accept-Or-Argue In The Orchestrator

Accept-or-Argue is a useful human workflow for handling contested review feedback in `codex-review`, but it is not an Orchestrator responsibility.

In Regentara, disagreement handling belongs in the task, Reviewer output contract, Remediator behavior, or `ReviewFixPolicy`. The Orchestrator should not adjudicate whether a finding was accepted, rejected, deferred, repeated, or escalated.

### Treat Simple Verdict Labels As Policy-Level Details

`APPROVED` / `CHANGES_REQUESTED` is a useful plugin surface. Regentara already has a more generic routing surface:

- `complete-ok`
- `complete-fail`
- `remediate`

The Orchestrator should not be changed to mirror the plugin verdict vocabulary. If a policy wants to consume reviewer verdicts named `accepted`, `rejected`, `approved`, or `changes_requested`, that mapping should stay inside the policy or Reviewer schema.

## Missing Piece In Regentara

The real gap is terminal explanation.

When `ReviewFixPolicy` decides to leave the improvement cycle, Regentara records completion status and failure reason, but there is no clear durable artifact explaining why the policy stopped and what evidence supports that decision.

That matters for both success and failure:

- On `complete-ok`, the run should be able to point to the accepted evidence.
- On `complete-fail`, the run should explain whether the loop stopped because budget was exhausted, progress stalled, a policy threshold was crossed, or the reviewer surfaced an unrecoverable condition.

This artifact should be policy-owned semantically. The Orchestrator may persist it, but should not author or interpret it.

## Terminal Decision Artifact

A corrected Regentara-oriented design would let `ReviewFixPolicy` optionally return a terminal artifact when it returns `complete-ok` or `complete-fail`.

Example shape:

```js
{
  decision: "complete-fail",
  session,
  reason: "remediation budget exhausted",
  terminalArtifact: {
    kind: "review-policy-terminal-decision",
    title: "Remediation Budget Exhausted",
    summary: "The reviewer continued to reject the task after all remediation attempts were used.",
    evidence: [
      { type: "review", ref: "..." },
      { type: "policy-session", ref: "..." }
    ],
    unresolvedFindings: [
      "..."
    ]
  }
}
```

The exact schema can be smaller, but the responsibility split should stay clear:

- `ReviewFixPolicy` owns the semantic explanation.
- The Orchestrator stores the artifact and references it from final run metadata or completion events.
- The Orchestrator does not inspect branch, plan, verdict taxonomy, finding categories, or policy-session contents.

## Recommended Direction

Do not port `codex-review` workflow phases into Regentara.

Use the comparison only to sharpen Regentara's terminal run story:

1. Add a policy-produced terminal decision artifact.
2. Persist that artifact generically in the run directory.
3. Reference it from run metadata or the final completion event.
4. Keep task shape, workspace implementation, review-note survival, and disagreement handling delegated to agents, prompts, tasks, artifact policy, or `ReviewFixPolicy`.

That preserves Regentara's core abstraction while addressing the actual missing operational artifact.
