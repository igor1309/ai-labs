# notio — Change Log

## 2026-04-18

- Reviewed ADRs 001–005 against ADR structure template and review standard.
- Added `## Executive Summary`, `## Rules / Invariants` (MUST/MUST NOT), and `## Non-Goals` sections to all five ADRs.
- Enumerated `enrichment` status values (`full | partial | failed | none`) in ADR-001.
- Hardened "should" → "MUST" for secret webhook path in ADR-002.
- Added diagnostic containment invariants to ADR-004.
- Added `notio_v<version>` tag format and cross-reference to repo-level release ADRs in ADR-005.
- Moved spec files (`spec-capture-message-and-item-schema.md`, `spec-telegram-webhook-adapter-behavior-v0.0.2.md`) from `docs/adr/` to `docs/specs/` per CLAUDE.md spec placement rule.
- Archived `pre-adr-supabase-storage-implementation.md` to `docs/adr/archive/` (superseded by ADR-003).
