---
date: 2026-08-03
model: gpt-5.6
description: "Dated acceptance evidence index for Claude and Codex adversarial-cycle runtime portability."
---

# Runtime Portability Acceptance

This index records the Phase 5 acceptance evidence for the runtime-neutral
adversarial-cycle launcher boundary. The disposable probes used the committed
skill resolver, dispatcher, and adapters. Their host bridges invoked the
installed Claude and Codex runtimes and supplied the resulting native host
responses to the adapters; the production adapters themselves only translated
the canonical manifest and normalized the host result.

## Environment and Fixture

- Date: 2026-08-03.
- Python: `Python 3.14.6`.
- Claude: `2.1.220 (Claude Code)`.
- Codex: `codex-cli 0.146.0`.
- Disposable evidence root:
  `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak`.
- Shared fixture base: `670de0aff2a1e4e397ae388e4a196860f3c5b9c9`.
- The miniature brief requires one deterministic `artifact.txt` containing
  `runtime-portability-artifact` followed by a newline.
- Claude terminal tree: `6a5bdbbadc221b8f4c17bc8d5448f5854278c0d6`.
- Codex terminal tree: `f60ac9a3469d244d53fbde3b241dbfe94bc76ec6`.
- Both terminal fixture worktrees have empty `git status --porcelain` output.

## Resolved Manifests

| Host | Manifest | Profile digest | Manifest digest | Implementer selection |
|---|---|---|---|---|
| Claude | `claude-run/.cycle/execution-manifest.json` | `fba9536f7baa0a0d1e5d3c59fd6cd786c8d19dd8496166d0e50d687e72` | `6e13c014d03a1905cec4ddac357bd04341a907ed5075aa41ee1fa036e01baf96` | `sonnet` / `medium`, `profile-default`, cold |
| Codex | `codex-run/.cycle/execution-manifest.json` | `8795ae73c31bf4b1cdee62a0a4c19ab8254921a4e3a81c0d22cf78d92f2a0f42` | `1576f3e6e5de2f01c8ff274ce1b5b64fa8ea7b9ca469d9d7eafef99946540487` | `gpt-5.6-luna` / `max`, `caller-preset`, cold |

The Claude manifest uses `runtime/claude.toml`; the Codex manifest uses
`runtime/codex.toml`. Both set `unavailable_model_policy = "stop"` and contain
no fallback field.

## Acceptance Verdicts

| Cell | Verdict | Evidence |
|---|---|---|
| Claude defaults | **PASS** | Claude manifest digest above; Planner `opus`/`high` warm, Implementer `sonnet`/`medium` cold, Reviewer `opus`/`high` cold, Escalation `opus`/`high` warm. |
| Shared launcher input | **PASS** | Both live manifests use schema version 1 with the same role envelope and canonical role/result fields; manifests are recorded at the paths below. |
| Claude launcher mapping | **PASS** | Implementer requested `model=sonnet`, `effort=medium`, `context_mode=cold`; host Task/session identifier `215b06f0-1700-4a83-8ca6-a4b58b823419`; cold Reviewer identifier `2e57bf8e-9d0f-48ee-b856-4af11988ced0`. |
| Claude independent review | **PASS** | Classification `cross-runtime`; orchestrator `sonnet`/Anthropic and independent reviewer `gpt-5.6-sol`/OpenAI; Codex host identifier `019fc705-94d8-7a20-8143-afcbcb50cb34`; audit is read-only and clean. |
| Codex defaults | **PASS** | Codex manifest digest above; Planner `gpt-5.6-sol`/`high` warm, Reviewer `gpt-5.6-sol`/`high` cold, Escalation `gpt-5.6-sol`/`xhigh` warm, independent review `gpt-5.6-luna`/`max` cold. |
| Luna Max override | **PASS** | `--set implementer=luna-max` resolves Implementer to `gpt-5.6-luna` / `max`, with `source=caller-preset` and cold context. |
| Codex launcher mapping | **PASS** | Implementer host arguments contain `model=gpt-5.6-luna`, `reasoning_effort=max`, `fork_turns=none`; native agent identifier `019fc706-3524-75b3-aec0-7a03ade10173`. |
| Codex independent review | **PASS** | Classification `same-runtime-fresh-pass`; orchestrator and reviewer both record OpenAI Codex `gpt-5.6-luna` / `max` in separate cold launches; reviewer identifier `019fc706-d34b-7c03-b078-21aa4d53313d`; audit is read-only and clean. |
| Shared launch result | **PASS** | Accepted Claude and Codex results and rejected fake results all contain `role`, `runtime`, `requested_model`, `requested_effort`, `status`, `runtime_task_or_agent_id`, `adapter_error`, and `review_round_spent`; accepted results carry native IDs and rejected results carry `null` IDs. |
| Unavailable explicit model | **PASS** | Both adapters preserve the requested `unavailable-runtime-portability-test-model`, exact adapter errors, and supplied `review_round_spent=11`; each has one native attempt, no profile-default launch, no fallback launch, and a terminal `stopped` tracker. |
| Fix ownership | **PASS** | Both independent audits have zero accepted findings and zero routed fixes; both terminal trackers record `accepted_independent_findings=0`. |
| Legacy tracker fixture | **PASS** | The historical `codex-audit` key remains byte-for-byte represented by equal before/after source digests; interpretation records `legacy-codex-review` without rewriting the source. |
| Receipt compatibility | **PASS** | Claude and Codex receipts retain the brief SHA, implementation tree SHA, tracker path, verdict `done`, and execution-manifest digest; corresponding terminal trackers carry the same compatibility values. |
| Worktree hygiene | **PASS** | Claude and Codex terminal fixture trees, plus the legacy fixture tree, report clean status; rejection fixtures also report clean status. |

## Evidence Map

### Live Claude probe

- Summary: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/summary-claude.json`.
- Run: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/claude-run`.
- Manifest: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/claude-run/.cycle/execution-manifest.json`.
- Tracker: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/claude-run/.cycle/tracker.json`.
- Receipt: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/claude-run/.cycle/receipt.json`.
- Independent audit: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/claude-run/.cycle/audits/independent.json`.
- Host primitive evidence: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/claude-run/.cycle/native/planner.json`, `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/claude-run/.cycle/native/implementer.json`, `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/claude-run/.cycle/native/reviewer.json`, and `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/claude-run/.cycle/native/independent_review.json`.

### Live Codex probe

- Summary: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/summary-codex.json`.
- Run: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/codex-run`.
- Manifest: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/codex-run/.cycle/execution-manifest.json`.
- Tracker: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/codex-run/.cycle/tracker.json`.
- Receipt: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/codex-run/.cycle/receipt.json`.
- Independent audit: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/codex-run/.cycle/audits/independent.json`.
- Host primitive evidence: `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/codex-run/.cycle/native/planner.json`, `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/codex-run/.cycle/native/implementer.json`, `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/codex-run/.cycle/native/reviewer.json`, and `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/codex-run/.cycle/native/independent_review.json`.

### Failure and compatibility probes

- Unavailable-model negative control:
  `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/unavailable-model-negative-control.json`.
- Claude stopped rejection fixture tracker:
  `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/claude-rejection-fixture/.cycle/tracker.json`.
- Codex stopped rejection fixture tracker:
  `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/codex-rejection-fixture/.cycle/tracker.json`.
- Legacy tracker evidence:
  `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/legacy-tracker-evidence.json`.
- Legacy source tracker:
  `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/legacy-fixture/.cycle/legacy-tracker.json`.
- Interpreted legacy audit:
  `/var/folders/4t/dtttc90s5njf7xp72c_wtwlm0000gn/T/adversarial-cycle-runtime-portability-3em6xlak/legacy-fixture/.cycle/interpreted-independent-audit.json`.

## Gate Record

- Phase 1 corrected ADR gate: `ADR: PASS`, exit 0, against the preserved ADR.
- Phase 2 unit gate: 17 tests, exit 0; resolver Luna Max output contains
  `gpt-5.6-luna`, `max`, and `caller-preset`, with no fallback field.
- Phase 3 unit/static gate: 19 tests, exit 0; the forbidden-pattern `rg`
  check returned no matches (exit 1 as required).
- Phase 4 gate: `git diff --check` exit 0 and all four ownership terms present;
  the separate repository commit contains only `commands/codex-judge.md`.
- Phase 5 acceptance inspection: every verdict cell in this index is `PASS`;
  both terminal trackers and receipts are present and compatible.
