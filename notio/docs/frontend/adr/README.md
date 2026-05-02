---
date: 2026-04-24
model: gpt-5
description: "Index and namespace guidance for Notio frontend ADRs"
---

# Frontend ADRs

Architecture decisions scoped only to the Notio **frontend** live here.

Product-family and capture/backend ADRs live under `notio/docs/adr/`.
These ADRs form their own numbering namespace (`ADR-001`, `ADR-002`, ...) distinct from the Notio product/capture/backend ADRs under `notio/docs/adr/` (`adr-001-...`, `adr-002-...`).

Filenames use uppercase `ADR-NNN-...` to make the namespace visually distinct from the lowercase `adr-NNN-...` used by Notio product/capture/backend ADRs. Cite as "Frontend ADR-NNN" for these files and "Notio ADR-NNN" for files under `notio/docs/adr/` when the context is ambiguous.

- [ADR-001 — frontend architecture for mvp_01 browse client](ADR-001-frontend-architecture-mvp01-supabase-browse.md)
- [ADR-002 — auth model for mvp_01 read-only Supabase frontend](ADR-002-auth-model-mvp01-readonly-supabase-frontend.md)
- [ADR-003 — mvp_01 product scope for read-only browse frontend](ADR-003-mvp01-product-scope-readonly-browse-frontend.md)
- [ADR-004 — read-model contract for mvp_01 browse](ADR-004-read-model-contract-mvp01-browse.md)
- [ADR-005 — single-user data model for mvp_01 frontend](ADR-005-single-user-data-model-mvp01-frontend.md)
- [ADR-006 — platform, hosting, and repo layout for mvp_01 frontend](ADR-006-platform-hosting-repo-layout-mvp01-frontend.md)
- [ADR-007 — frontend deployment verification by page version](ADR-007-frontend-deployment-verification-page-version.md)
- [ADR-008 — local browser testing for mvp_01 frontend](ADR-008-local-browser-testing-mvp01-frontend.md)
