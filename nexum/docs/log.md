# Log

## 2026-04-13
- Implement frontend Phase 4 repo services: add shared `HTTPClient` contract plus `GetReposService`, `AddRepoService`, and `EditNoteService` with full spec coverage (20 tests) and verified native/WASM builds.
- Add backend implementation plan (`docs/plans/nexum-backend-plan.md`): six-phase execution plan from package scaffold through composition root, traced back to backend ADR invariants.
- Add frontend implementation plan (`docs/plans/nexum-frontend-plan.md`): eight-phase execution plan covering `ObservableModel`-based state machines, shared services, HTTP client chain, WASM UI, and composition root wiring.

## 2026-04-12
- Tighten Nexum specs after review: clarify backend protocol boundaries and infrastructure-failure rules, align frontend state-machine and HTTP-chain ownership rules, and sharpen UX validation language.
- Add auth services spec (`docs/specs/nexum-auth-services.md`): lock `LoginService` request/response mapping over the shared `HTTPClient` against `POST /auth/login`.
- Add backend spec v1 (`docs/specs/nexum-backend-spec-v1.md`): protocols, pure functions, use cases, routing, startup, and required tests.
- Add frontend component specs: app state machine, auth state machine, repo services, HTTP client chain.

## 2026-04-06
- Clean up doc tree: extract implementation notes from review amendments, fold orphaned design decisions (DB schema, URL validation, token storage) into ADRs, delete `reviews/` directory.
- Move ADRs into `docs/ADR/`, fix cross-directory references.
- Delete superseded pre-ADR spec and its supersession note — all surviving decisions live in normative ADRs and UX spec.
- Add project README and changelog.

## 2026-04-05
- Lock architecture: backend ADR v0.3.0, frontend ADR v0.2.0, backend auth ADR v0.1.0, frontend auth ADR v0.1.0, stack ADR v0.1.0.
- Lock API contract: OpenAPI v1.6.0 (4 endpoints: login, add repo, get repos, edit note).
- Create UX spec v1 (table columns, sort, search, inline editing, duplicate handling).
- Review architecture for implementation readiness; close all findings via amendments.
