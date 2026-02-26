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

### 2. Clarity: `pass`

- ~~**nomos.md is fully duplicated**~~ — Fixed: removed duplicate content and malformed frontmatter.
- ~~**Relationship between nomos.md and nomos-north-star.md is unstated**~~ — Resolved: `nomos-north-star.md` archived to `docs/archive/` as an early draft based on the Uber GenAI Gateway article; `nomos.md` is the sole authoritative project definition.

### 3. Consistency: `pass`

No structural contradictions at the directional level. Implementation-level
naming differences (`LiveRunner` vs `HttpRunner`, `SQLite/Postgres` vs
`SQLite`) are expected in seed docs generated as illustrative examples.

### 4. Readability: `pass`

- Most docs are well-structured with numbered sections, clear headings, and concise bullets.
- `nomos-name.md` and `adr-0001.md` follow good patterns.
- ~~Duplicated `nomos.md`~~ — Fixed.
- `runner-selection.md` starts at h2 instead of h1 (minor; see observations).

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

All resolved.

| # | Severity | Location | Issue | Resolution |
|---|----------|----------|-------|------------|
| 1 | ~~`fail`~~ | `nomos.md` | Duplicated content; malformed frontmatter | Fixed in `a646a08` |
| 2 | ~~`fail`~~ | `nomos-north-star.md` | Undefined relationship with `nomos.md` | Archived to `docs/archive/` with Uber source link in `a646a08` |

## Observations (non-blocking)

| # | Location | Note |
|---|----------|------|
| 1 | `runner-selection.md:8` | Heading starts at h2; other docs use h1 |
| 2 | `ops-runbook-v0.md:226` | Cron backup example silences failures (`>/dev/null 2>&1`) — worth fixing if adopted as-is |
| 3 | Various | Implementation-level naming differences across docs (`LiveRunner`/`HttpRunner`, `SQLite/Postgres`/`SQLite`) are fine for seed docs but should be resolved when implementation starts |
