# Log

## 2026-05-01

- ADR-004 settled at v2: deploy wiring now fits the existing repo pipelines (reusable `clipdeck-deploy.yml` dispatched from `release-unit.yml`, `notify-telegram-failure.yml` for failures, unauthenticated `GET /api/items` → `401` as the post-deploy check).
- Doc set ready for implementation: MVP plan at `clipdeck/docs/plans/clipdeck-mvp.md` (TypeScript on Workers, Vitest, gray-matter, raw fetch, vanilla TS frontend; four phases). Spec amended in the same change to name the source repo (`igor1309/ai-labs`, branch `trunk`) and pin the 502 response schema.
- ADR-004 (CI/CD workflows) settled at v1: per-project `clipdeck-core.yml` runs typecheck and tests on path-filtered PRs; production deploys are tag-driven via the existing `release-unit.yml`, calling `wrangler deploy` with a single-account, `Workers Scripts: Edit`-only Cloudflare API token rotated every 12 months. CI never sees the runtime GitHub PAT. Lives at `clipdeck/docs/adr/adr-004-ci-cd-workflows.md`.
- ADR-003 (deployment topology) settled at v1: single Cloudflare Worker with Static Assets hosts the iPhone page and `/api/items` on one origin; GitHub PAT bound via Workers Secrets. Scope is the production binding (local dev and preview are out of scope). CI/CD deferred to a future ADR-004. Lives at `clipdeck/docs/adr/adr-003-deployment-topology.md`.
- ADR-002 settled at v1: credential is a GitHub fine-grained PAT, read-only on ai-labs, in the deploy platform's secret manager, manually rotated within 90 days. Spec updated to reference it. Lives at `clipdeck/docs/adr/adr-002-credential-lifecycle.md`.
- Spec settled at v1: single source of behavior with 29 enumerated tests covering the API contract and frontend rules. Aligned with the ADR; ready for implementation. Lives at `clipdeck/docs/specs/spec-iphone-copy-library.md`.
- ADR settled at v1: 6-section template with MUST/MUST NOT invariants. Backend is sole runtime GitHub principal; ADR is single source of truth for the path allowlist; platform cache primitives banned; per-request memoization permitted. Lives at `clipdeck/docs/adr/adr-001-iphone-copy-library.md`.
- Project established as a docs-only top-level unit. ADR accepted, spec drafted, for an iPhone-friendly webpage that copies prompts/skills with server-side front matter stripping.
