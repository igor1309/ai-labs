# Review: Nomos Seed Docs

Date: 2026-02-26
Reviewer: claude/opus-4-6
Scope: All files under `nomos/docs/` added in commit `2d79464`

Note: These are seed/directional docs, not implementation specs. Names like
`LiveRunner`/`HttpRunner`, token scope details, and cross-reference gaps are
illustrative examples that will be resolved during implementation. This review
focuses on structural and directional issues only.

---

## Architecture Doc Review Checklist

### 1. Ambiguity: `pass`

At the seed-doc level, directional ambiguity is acceptable. Runner names,
persistence options, and token scope details are implementation concerns
that don't need resolution yet.

### 2. Clarity: `fail`

- **nomos.md is fully duplicated**: Lines 1–100 and 102–190 are identical content. YAML frontmatter (lines 1–8) is malformed — two merged frontmatter blocks. This is the project's primary definition doc and it's broken.
- **Relationship between nomos.md and nomos-north-star.md is unstated**: `nomos.md` scopes Phase 0–2 with 5 capabilities. `nomos-north-star.md` describes a broader vision with 6 objectives. Neither doc states which is authoritative for current work nor how they relate (e.g., "north-star is the long-term vision; nomos.md is the current phase scope").

### 3. Consistency: `pass`

No structural contradictions at the directional level. Implementation-level
naming differences (`LiveRunner` vs `HttpRunner`, `SQLite/Postgres` vs
`SQLite`) are expected in seed docs generated as illustrative examples.

### 4. Readability: `warn`

- Most docs are well-structured with numbered sections, clear headings, and concise bullets.
- `nomos-name.md` and `adr-0001.md` follow good patterns.
- Duplicated `nomos.md` significantly hurts readability.
- `runner-selection.md` starts at h2 instead of h1, breaking convention with other docs.

### 5. Best Practices: `pass`

- Docs align with repo architecture: Nomos owns its runner abstraction, VPS-first fits solo-operator model, streaming-first is sound.
- ADR format properly used for deployment decision.
- Testability addressed as day-0 concern with runner/stub boundary.
- Bearer token auth with rotation and hashed logging follows security best practices for V0.

### 6. Drift Resistance: `warn`

- Good enforceable language (`MUST`) in `infra.md`, `testability.md`, and `runner-selection.md`.
- No verification mechanism exists yet for any MUST — acceptable at seed stage, but worth noting for when implementation begins.

---

## Required Fixes

| # | Severity | Location | Issue | Fix |
|---|----------|----------|-------|-----|
| 1 | `fail` | `nomos.md:1-190` | Entire document duplicated; malformed frontmatter | Remove duplicate (lines 102–190); fix frontmatter to single valid block |
| 2 | `fail` | `nomos.md` + `nomos-north-star.md` | Undefined relationship | Add a one-line relationship statement to each doc |

## Observations (non-blocking)

| # | Location | Note |
|---|----------|------|
| 1 | `runner-selection.md:8` | Heading starts at h2; other docs use h1 |
| 2 | `ops-runbook-v0.md:226` | Cron backup example silences failures (`>/dev/null 2>&1`) — worth fixing if adopted as-is |
| 3 | Various | Implementation-level naming differences across docs (`LiveRunner`/`HttpRunner`, `SQLite/Postgres`/`SQLite`) are fine for seed docs but should be resolved when implementation starts |
