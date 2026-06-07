---
name: agonara-curator-research
author: Igor Malyarov
version: "1.0.0"
description: Operate as an Agonara program curator to ground and expand a program — record external sources with justifying metadata, read coverage-gap diagnostics as draft guidance, and generate, trace, and explicitly accept or reject LLM-assisted curation suggestions. Use when a curator agent is researching a program: adding sources, finding gaps, or reviewing generated suggestions. Suggestions and gaps are draft material until accepted; accepting a suggestion only materializes a draft candidate, never accepted corpus.
trigger: when a curator agent needs to record an external source, read coverage gaps, or generate/review LLM curation suggestions
---

# Agonara curator — research

Ground a program in external sources and expand it deliberately using coverage
gaps and LLM-assisted suggestions — all as **reviewable drafts**, never as
content that becomes part of the program on its own.

Assumes [`agonara-api-access`](../agonara-api-access/SKILL.md) for auth, the
`X-Agonara-CSRF` header on mutations, and the envelope. This skill produces
material that the corpus and assessment skills then accept; it does not itself
promote anything into accepted corpus. Acceptance into the program is always
[`agonara-curator-corpus`](../agonara-curator-corpus/SKILL.md) /
[`agonara-curator-assessment`](../agonara-curator-assessment/SKILL.md).

## External sources

Record the public plans, exam requirements, standards, materials, and research
findings that justify the program (CUR-07):

- **Record** — `POST /programs/{programId}/sources` with
  `{ "sourceKind", "title", "locator"?, "citation"? }`. Give enough metadata
  (`locator`, `citation`) to explain *why* the source informed the program.
- **List** — `GET /programs/{programId}/sources` (paged via `limit`/`cursor`).

Recorded sources are referenced by id (`sourceIds`) when proposing corpus
candidates in [`agonara-curator-corpus`](../agonara-curator-corpus/SKILL.md).
Recording a source does not by itself add any topic, concept, or check.

## Coverage gaps

Coverage gaps are **diagnostics**, not accepted content (CUR-09):

- **Read** — `GET /programs/{programId}/coverage-gaps`, narrowed by `scopeKind`
  (`program` / `topic` / `period`), `scopeId`, `minimumSeverity`
  (`info` / `warning` / `critical`), and `gapKind`.

Treat what comes back as guidance toward deliberate improvement — missing or
weak coverage to consider. Never treat a gap as a fact already in the corpus.

## LLM-assisted curation suggestions

Generated suggestions discover candidate topics, concepts, materials, checks, and
gaps faster — and stay draft until you explicitly act (CUR-11…13):

- **Generate** — `POST /programs/{programId}/llm-curation-suggestions`. Output is
  captured as draft suggestions; nothing is added to the program by generating.
  Send `{ "suggestionPolicyId", "idempotencyKey", "maxSuggestions",
  "curatorInstruction"?, "coverageGapIds"?, "contextEntityIds"?,
  "allowedSuggestionKinds"? }`. At least one of `curatorInstruction`,
  `coverageGapIds`, or `contextEntityIds` must provide generation context.
  `maxSuggestions` is an integer from 1 through 20. If supplied,
  `allowedSuggestionKinds` contains one or more of `navigation_candidate`,
  `quick_check_candidate`, `assessment_criterion_candidate`,
  `open_answer_check_candidate`, or `readiness_check_candidate`.
  The built-in policy is `default-deterministic-policy`; use an
  operator-provided policy id when the target instance is configured
  differently.
- **List** — `GET /programs/{programId}/llm-curation-suggestions`, filtered by
  `status` (`draft_suggestion` / `materialized` / `rejected`) and
  `suggestionKind` (one of the kinds above).
- **Trace origin before deciding** — `GET /llm-curation-suggestions/{suggestionId}`
  exposes a suggestion's source, prompt context, or supporting evidence. Read
  this and judge whether it belongs before accepting (CUR-13).
- **Accept** — `POST /llm-curation-suggestions/{suggestionId}/acceptance`.
- **Reject** — `POST /llm-curation-suggestions/{suggestionId}/rejection`.

**Accepting a suggestion is not accepting it into the corpus.** Acceptance
*materializes a draft candidate* (the suggestion's `status` becomes
`materialized`); that candidate still goes through the normal corpus/assessment
acceptance in the other curator skills before it is part of the program. So
acceptance here is two human-owned gates, not one. Expect `rejected` reasons like
`llm_curation_suggestion_already_materialized` or
`llm_curation_suggestion_already_rejected` when re-acting on a resolved
suggestion, and provider reasons (`provider_budget_exceeded`,
`provider_execution_failed`, `provider_output_rejected`) on generation — honor
the reason rather than retrying blindly.

## Boundaries this skill keeps

- **Drafts, not corpus.** Sources, gaps, and suggestions are draft/diagnostic
  material. None of them is accepted program content until accepted through the
  corpus or assessment skill.
- **No auto-acceptance.** Generated content never becomes program content
  automatically; accepting or rejecting is always an explicit curator action
  (CUR-12).
- **No student state.** Coverage and suggestions describe the program, not any
  individual student's attempts or progress — this skill never reads private
  student learning state.
