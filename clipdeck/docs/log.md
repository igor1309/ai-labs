# Log

## 2026-05-01

- ADR review: applied `adr-governance` review standard. Restructured to the 6-section template (added Executive Summary, consolidated invariants under a single `Rules / Invariants` section with MUST/MUST NOT language, dropped non-standard `Accepted Scope` tail). Closed seven boundary/stability warnings — disambiguated backend topology, defined item id derivation as the source-relative path, specified malformed-front-matter fallback, allowed per-request in-process memoization while keeping the no-cache invariant, named HTTPS as the shared-secret transport requirement, made the allowlist amendable only via this ADR, and added GitHub rate-limit exposure to accepted tradeoffs.
- Project established as a docs-only top-level unit. Initial artifacts: ADR (`adr-iphone-copy-library.md`, accepted) and spec (`spec-iphone-copy-library.md`, draft) for an iPhone-friendly private webpage that lists reusable prompts and skills from `prompts/` and `dev-skills/public/`, with one-tap copy and server-side front matter stripping. No implementation yet.
