# Review: Nomos Seed Docs

Date: 2026-02-26
Reviewer: claude/opus-4-6
Scope: All files under `nomos/docs/` added in commit `2d79464`

---

## Architecture Doc Review Checklist

### 1. Ambiguity: `fail`

- **Runner naming conflict**: `runner-selection.md:11` calls the live runner `LiveRunner`; `testability.md:38` calls it `HttpRunner`. Two names for the same concept.
- **Persistence option left open**: `adr-0001.md:19` says "SQLite/Postgres"; `infra.md:52` commits to "SQLite" only. ADR leaves an alternative the infra doc already resolved.
- **Token scope undefined in infra**: `runner-selection.md:25-26` introduces `scope=live` and `scope=stub` on tokens, but `infra.md:85-89` defines tokens as "static bearer tokens per project" with no mention of scopes.

### 2. Clarity: `fail`

- **nomos.md is fully duplicated**: Lines 1–100 and 102–190 are identical content. YAML frontmatter (lines 1–8) is malformed — two merged frontmatter blocks.
- **Relationship between nomos.md and nomos-north-star.md is unstated**: `nomos.md` scopes Phase 0–2 with 5 capabilities. `nomos-north-star.md` describes a broader vision with 6 objectives. Neither doc states which is authoritative for current work nor how they relate.
- **runner-selection.md heading level**: Starts with `## Runner Selection (V0)` (h2) instead of `#` (h1) like every other doc.

### 3. Consistency: `fail`

- Runner name contradiction: `LiveRunner` vs `HttpRunner` (see above).
- Persistence contradiction: `SQLite/Postgres` vs `SQLite` (see above).
- `runner-selection.md` and `testability.md` overlap on runner concepts without cross-referencing each other.
- `ops-runbook-v0.md` operationalizes infra decisions but doesn't link back to `infra.md`.

### 4. Readability: `warn`

- Most docs are well-structured with numbered sections, clear headings, and concise bullets.
- `nomos-name.md` and `adr-0001.md` follow good patterns.
- Duplicated `nomos.md` significantly hurts readability. Missing h1 in `runner-selection.md` breaks convention.

### 5. Best Practices: `pass`

- Docs align with repo architecture: Nomos owns its runner abstraction, VPS-first fits solo-operator model, streaming-first is sound.
- ADR format properly used for deployment decision.
- Testability addressed as day-0 concern with runner/stub boundary.
- Bearer token auth with rotation and hashed logging follows security best practices for V0.

### 6. Drift Resistance: `warn`

- Good enforceable language (`MUST`) in `infra.md`, `testability.md`, and `runner-selection.md`.
- No verification mechanism for any MUST — no test, CI gate, or review checklist to enforce them.
- `ops-runbook-v0.md:226`: Cron backup `>/dev/null 2>&1` silences failures. Solo operator needs backup failure visibility.

---

## Required Fixes

| # | Severity | Location | Issue | Fix |
|---|----------|----------|-------|-----|
| 1 | `fail` | `nomos.md:1-190` | Entire document duplicated; malformed frontmatter | Remove duplicate (lines 102–190); fix frontmatter to single valid block |
| 2 | `fail` | `runner-selection.md:11` vs `testability.md:38` | `LiveRunner` vs `HttpRunner` | Pick one name; update both docs |
| 3 | `fail` | `adr-0001.md:19` vs `infra.md:52` | "SQLite/Postgres" vs "SQLite" | Update ADR to "SQLite" since infra.md already decided |
| 4 | `fail` | `nomos.md` + `nomos-north-star.md` | Undefined relationship | Add a relationship statement to each doc |
| 5 | `warn` | `runner-selection.md:25-26` vs `infra.md:85-89` | Token scope model partially specified | Add scope to infra.md auth section or cross-reference runner-selection.md |
| 6 | `warn` | `runner-selection.md:8` | Heading starts at h2 | Change to `# Runner Selection (V0)` |
| 7 | `warn` | `runner-selection.md` + `testability.md` | Overlapping runner definitions, no cross-references | Add cross-references between docs |
| 8 | `warn` | `ops-runbook-v0.md:226` | Cron silences backup failures | Remove `>/dev/null 2>&1` or redirect to a log file |
| 9 | `warn` | All MUST statements | No verification mechanisms | Future: add compliance checklist or test references |
