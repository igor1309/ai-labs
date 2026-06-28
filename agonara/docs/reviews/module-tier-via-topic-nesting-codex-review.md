---
date: 2026-06-28
model: claude-opus-4-8
description: "Codex (gpt-5.x) adversarial review of the ADR-024 module-tier spec and implementation plan, with per-finding judgment and the fixes applied. Reviewer: codex-cli 0.142.2, read-only sandbox."
---

# ADR-024 Module Tier — Codex Review and Resolution

Codex reviewed `docs/specs/module-tier-via-topic-nesting.md` and
`docs/plans/module-tier-via-topic-nesting.md` against the accepted ADR-024 and the v0.4.0
source (read-only). Nine findings; each was independently judged against source before fixing.
All nine were accepted. Grounding-accuracy findings (3, 6, 7) were verified against source.

## Findings and resolution

| # | Sev | Finding | Verdict | Fix |
|---|---|---|---|---|
| 1 | major | Dependency gate said ADR-023 preflight "before Phase 2", but Phase 1 is code (the migration must recreate ADR-023's active-unique index) | Accept | Gate moved before Phase 1; now requires both the reason AND the active-unique index to pre-exist |
| 2 | blocker | Migration wording toggled `PRAGMA foreign_keys=OFF` "inside a transaction" — a no-op in SQLite | Accept | Spec rule 12 + plan step 1.1 rewritten: FK pragma OFF/ON sits OUTSIDE the transaction, never via `database.transaction` |
| 3 | major | Spec claimed "per-topic concept/material summaries" that `listProgramNavigation` does not produce | Accept (verified corpus.js:1465, 3593) | Spec interface + test 16 reframed to the real flat shape (`childTopics` is the only added field) |
| 4 | major | Behavior rules cover `relationship_update` but no test proves that branch | Accept | Added spec tests 25–28 and Phase 2 coverage for the `relationship_update` path |
| 5 | major | New rejection reasons emitted in Phase 2/3 but enum/OpenAPI deferred to Phase 6 (contract-inconsistent commits) | Accept | Enum + OpenAPI additions moved to Step 2.0; Phase 6 is now verification-only |
| 6 | major | Active-endpoint check pointed at `getAcceptedCorpusEntityRecord`, which omits `status` | Accept (verified storage.js:4092 vs 4150) | Plan now mandates `getAcceptedCorpusEntityLifecycleStatusRecord` for the status read |
| 7 | minor | `learn-ui.js:3079-3083` is `llmSuggestionDraftPreviewText`, not the nav consumer | Accept (verified: consumer is `renderNavigationSummary*` at 3341–3377) | Fixed in spec, plan, AND the ADR (which carried the same inherited bad ref) |
| 8 | minor | "tests 14, 23" cited for flat-program compatibility; test 14 is arbitrary-depth nesting | Accept | Corrected to test 23 in spec + plan + matrix |
| 9 | minor | Plan done-criteria used bare `npx tsc --noEmit` | Accept | Changed to `./scripts/run_silent.sh "build" npx tsc --noEmit` per repo rule |

## Grounding Codex confirmed correct (no change needed)

`supportedNavigationRelationshipKinds` location; endpoint-kind validation location;
`mapNavigationStorageRejection` passthrough; `listAcceptedNavigationRelationshipRecords(... status: "active")`;
the current `relationship_kind` and `from_kind`/`to_kind` CHECK claims; restore entry point name;
coverage-gap kind names; and ADR fidelity for the core single-parent / acyclic / active-endpoint
invariants.

## Disposition

All nine resolved in commit(s) on `claude/agonara-adr-024-module-tier`. The blocker (finding 2)
was the highest-value catch: the original FK-toggle wording would have left FK enforcement on
during the rebuild. No finding required reopening the ADR decision; finding 7 corrected a factual
line reference in the ADR without changing its substance.
