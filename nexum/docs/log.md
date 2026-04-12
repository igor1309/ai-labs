# Log

## 2026-04-12
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
