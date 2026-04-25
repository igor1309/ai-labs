# Regentara Log

## 2026-04-25

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
