# notio — Change Log

## 2026-04-18

- Reviewed ADRs 001–005 against ADR structure template and review standard.
- Added `## Executive Summary`, `## Rules / Invariants` (MUST/MUST NOT), and `## Non-Goals` sections to all five ADRs.
- Enumerated `enrichment` status values (`full | partial | failed | none`) in ADR-001.
- Hardened "should" → "MUST" for secret webhook path in ADR-002.
- Added diagnostic containment invariants to ADR-004.
- Added `notio_v<version>` tag format and cross-reference to repo-level release ADRs in ADR-005.
- Moved spec files (`capture-message-and-item-schema.md`, `telegram-webhook-adapter-behavior-v0.0.2.md`) from `docs/adr/` to `docs/specs/` per CLAUDE.md spec placement rule.
- Archived `pre-adr-supabase-storage-implementation.md` to `docs/adr/archive/` (superseded by ADR-003).

## 2026-04-18 (drift fix)

- Unified ADR front-matter across ADR-001…005 (`type: adr`, `author: OpenAI GPT-5.4 Thinking`) and normalized `Status` to `Accepted`.
- Fixed ADR-001 Context drift with ADR-003: removed stale claim that GitHub-backed storage is the first concrete persistence target; ADR-001 is now neutral about backend choice and defers to ADR-003 for the v1 selection.
- Tightened ADR-005 rule wording: replaced ambiguous "No artifact MUST be published …" with "Artifacts MUST NOT be published and deployment MUST NOT occur if tests fail."
- Corrected filename drift in the previous log entry (spec files live at `docs/specs/` without a `spec-` prefix).
