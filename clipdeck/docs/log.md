# Log

## 2026-05-01

- ADR-002 (credential lifecycle): unblocks implementation by deciding the credential is a GitHub fine-grained PAT scoped to ai-labs with `Contents: Read` + `Metadata: Read`, stored only in the deployment platform's secret manager, manually issued and rotated within 90 days, and never visible to CI or the frontend. Lives at `clipdeck/docs/adr/adr-002-credential-lifecycle.md`.
- Spec settled at v1: single source of behavior with 29 enumerated tests covering the API contract and frontend rules. Aligned with the ADR; ready for implementation. Lives at `clipdeck/docs/specs/spec-iphone-copy-library.md`.
- ADR settled at v1: 6-section template with MUST/MUST NOT invariants. Backend is sole runtime GitHub principal; ADR is single source of truth for the path allowlist; platform cache primitives banned; per-request memoization permitted. Lives at `clipdeck/docs/adr/adr-001-iphone-copy-library.md`.
- Project established as a docs-only top-level unit. ADR accepted, spec drafted, for an iPhone-friendly webpage that copies prompts/skills with server-side front matter stripping.
