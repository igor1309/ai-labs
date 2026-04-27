# Regentara Log

## 2026-04-27

- Addressed architecture-doc review of the MVP workflow runner implementation plan: resolved duplicate spec-test ownership, replaced ambiguous skill references, decided Regentara is an MVP release unit, separated provider CLI availability from execution, added explicit worktree creation, pinned Node minimum, and tightened first-task staging scope.
- Created the MVP workflow runner implementation plan from the accepted Regentara spec and ADRs. The plan incorporates the updated process guardrails from `63a14b3ad256f1728d5b4766df8d13c406fd1436`: explicit execution mode, worktree mode, push policy, auto-continue behavior, and final archive move.

## 2026-04-25

- ADR TODO: dropped Process Control item; TODO file removed (now empty). MVP behavior already committed by adr-005 (no timeouts; interruption stops the run); the deferral chain in adr-003 and adr-005 explicitly names a future process-control ADR and stands as the marker. Write the targeted ADR (or split into focused ADRs) when implementation surfaces a concrete pain point — hung subprocess, Ctrl+C UX, or orphaned descendants.
- ADR TODO: dropped Observability item. Observability emission inherits adr-005's fail-fast invariant (no carve-out): a failure to emit stops the run. For MVP shape (in-process, in-run-directory writes), the realistic failure modes overlap with artifact-write failures already covered. Best-effort semantics would be the right ADR trigger only when observability later crosses a network boundary (external collector, remote sink) — not now.
- ADR TODO: dropped Session & Trace Model item. Capture is already declared in adr-003 (runner and provider session references); persistence location in adr-004 (run directory, deferred metadata schema). Link/schema shape is an implementation finding against Codex/Claude Code; revisit only if implementation surfaces a non-trivial cross-reference decision.
- ADR TODO: dropped Review Contract item. Verdict schema and required evidence are agent I/O (spec); reviewer's flow authority and handoff to remediator already settled by adr-006 (orchestrator delegates routing to ReviewFixPolicy). Schema-reuse note (existing review skill) belongs in spec or `agents.yaml`.
- ADR TODO: dropped Settings Topology item. Discovery/precedence already consistent across adr-001 and adr-002; no shared "settings file" abstraction exists; secrets exclusion is permanent (Regentara does not manage credentials per adr-002), not a deferral. No new ADR needed; nothing to tighten in adr-002 (illustrative shape, not exhaustive lockdown).
- ReviewFixPolicy seam ADR (adr-006): accepted. Locks in that the Orchestrator delegates post-review routing to an injected protocol and does not adjudicate; threads an opaque session across rounds. Internals (decision values, session schema, budget mechanics) stay in spec. Orchestration doc tightened: "owns the workspace" → "runs within a selected workspace" with workspace lifecycle explicitly out of Orchestrator scope.
- Failure policy ADR (adr-005): tightened front-matter (description), defined "workflow execution has started", fixed artifact ADR cross-reference, specified pre-run interruption; renamed to `adr-005-failure-policy.md` to match numbered convention (collision with adr-004 run-artifacts resolved by renumbering failure-policy).
- ADR set complete for MVP scope: agent settings (adr-001), model routing (adr-002), CLI execution boundary (adr-003), run artifact storage and mutation policy (adr-004), failure policy (adr-005). All accepted after review.
- Reviewed and tightened all ADRs: added executive summaries, rules/invariants sections, aligned runner identifiers across ADRs, resolved cross-ADR deferral chains.
- Established ADR naming convention: `adr-NNN-<slug>.md` for numbered decisions, `regentara-adr-<slug>.md` for unnumbered.

## 2026-04-24

- Model routing ADR (adr-002): simplified route keys to `sonnet`/`opus`/`gpt`/`codex`, added MVP coverage requirement, tightened validation rules.
- Failure policy ADR: drafted and accepted — fail-fast, no retries, artifact preservation, startup vs runtime failure distinction.
- Agent settings ADR (adr-001): reviewed, added executive summary, tightened validation to match adr-002 pattern.

## 2026-04-23

- Project created — AI orchestrator (governance/routing layer over provider agents). Initial docs: naming brief, name pool, orchestration design, observability research prompt.
