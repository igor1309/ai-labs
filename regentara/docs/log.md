# Regentara Log

## 2026-04-25

- Failure policy ADR (adr-004): tightened front-matter (description), defined "workflow execution has started", fixed artifact ADR cross-reference, specified pre-run interruption; renamed to `adr-004-failure-policy.md` to match numbered convention.
- ADR set complete for MVP scope: agent settings (adr-001), model routing (adr-002), CLI execution boundary (adr-003), failure policy (adr-004), run artifact storage and mutation policy. All accepted after review.
- Reviewed and tightened all ADRs: added executive summaries, rules/invariants sections, aligned runner identifiers across ADRs, resolved cross-ADR deferral chains.
- Established ADR naming convention: `adr-NNN-<slug>.md` for numbered decisions, `regentara-adr-<slug>.md` for unnumbered.

## 2026-04-24

- Model routing ADR (adr-002): simplified route keys to `sonnet`/`opus`/`gpt`/`codex`, added MVP coverage requirement, tightened validation rules.
- Failure policy ADR: drafted and accepted — fail-fast, no retries, artifact preservation, startup vs runtime failure distinction.
- Agent settings ADR (adr-001): reviewed, added executive summary, tightened validation to match adr-002 pattern.

## 2026-04-23

- Project created — AI orchestrator (governance/routing layer over provider agents). Initial docs: naming brief, name pool, orchestration design, observability research prompt.
