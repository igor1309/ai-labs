---
title: ADR-007 Frontend and Backend Release Split
date: 2026-04-24
model: gpt-5
description: "Decides that Notio frontend and backend are independently released products, with Supabase schema ownership remaining in the backend."
version: 0.0.1
status: accepted
type: adr
---

# ADR-007: Frontend and Backend Release Split

## Status

Accepted

## Executive Summary

Notio is split into two independently released products: a backend capture service and a frontend browse client.
The backend owns Telegram ingress, capture, enrichment, persistence, Supabase schema, Supabase migrations, and the public data contract consumed by the frontend.
The frontend owns the Svelte/Vite browse experience, Cloudflare Pages deployment, and its visible page version.
The current asymmetric layout, where backend files live directly under `notio/` while frontend files live under `notio/frontend/`, is rejected because it makes `notio/` mean both product root and backend root.
This ADR defines ownership, release identity, and layout direction; it does not perform the file move.

## Related ADRs

- **Repo release ADR-003** — amended to allow explicit configured basenames for nested release units.
- **Repo release ADR-005** — amended to require manifest generation and validation for explicit basenames.
- **Notio ADR-005** — backend CI/CD behavior remains, but future backend tags move from `notio_v<version>` to `notio-backend_v<version>`.
- **Frontend ADR-006** — frontend remains under `notio/frontend/`; ADR-007 adds the symmetric backend root and independent frontend release identity.

## Context

Notio started as a backend-only capture service. The Swift/Hummingbird service, Docker deployment files, release metadata, deploy scripts, and Supabase migrations were placed directly under `notio/`.

The frontend was added later as a Svelte/Vite application under `notio/frontend/`. It has a different toolchain, a different hosting platform, and a separate Cloudflare Pages deployment path.

The two deployables are independently developed:

- backend changes can ship capture, enrichment, Telegram feedback, and Supabase schema changes without frontend changes
- frontend changes can ship browse UI, auth, config, and Pages deployment changes without backend process changes
- Cloudflare Pages deployment and VPS Docker deployment have different operational surfaces

Despite this independence, the current structure still exposes only one release unit named `notio`, with `notio/release.toml` as canonical metadata. This creates ambiguity:

- `notio/` sometimes means the product and sometimes means the backend implementation
- frontend versioning is not represented in release-unit metadata
- Supabase migrations sit beside both deployables even though they are backend-owned
- user-visible version display cannot be defined cleanly without deciding whether it represents product, backend, or frontend release identity

The rejected alternative is to keep a single `notio` release unit and render the same product version in both backend and frontend. That preserves a simple product version, but it does not match the now-independent frontend and backend development and deployment model.

## Decision

Notio is modeled as two independently released products under one product family:

1. **Notio backend**: the Swift capture service, deployed to the VPS as a Docker-producing release unit.
2. **Notio frontend**: the Svelte/Vite browse client, deployed to Cloudflare Pages as a non-Docker release unit.

The backend owns Supabase schema and migrations. The frontend consumes the backend-owned read contract and must remain compatible with it.

The repository layout must make ownership explicit by introducing symmetric component roots:

```text
notio/
  backend/
  frontend/
  docs/
  README.md
```

Release-unit metadata must follow the component roots:

- backend release metadata lives under `notio/backend/`
- frontend release metadata lives under `notio/frontend/`
- the backend release unit basename MUST be `notio-backend`; backend tags MUST be `notio-backend_v<version>`
- the frontend release unit basename MUST be `notio-frontend`; frontend tags MUST be `notio-frontend_v<version>`
- the historical `notio_v<version>` tag namespace remains historical for the pre-split backend release unit and MUST NOT be reused for either split component

The frontend page version must be the frontend release version. It must not display a Git SHA.

## Rules / Invariants

- `notio/backend/` MUST be the backend component root.
- `notio/frontend/` MUST be the frontend component root.
- Backend Swift package files, backend Docker files, backend deploy scripts, backend runtime env examples, and backend source/tests MUST live under `notio/backend/`.
- Supabase schema and migrations MUST live under `notio/backend/`.
- Frontend source, tests, Vite config, Pages config, and frontend package metadata MUST live under `notio/frontend/`.
- The backend release unit MUST be distinct from the frontend release unit.
- The backend release unit basename MUST be `notio-backend`.
- The frontend release unit basename MUST be `notio-frontend`.
- The backend release unit MUST be Docker-producing.
- The frontend release unit MUST NOT be Docker-producing.
- Backend tags and frontend tags MUST be distinct and must map to their own release metadata.
- The frontend visible version MUST come from frontend release metadata.
- The frontend visible version MUST NOT include a Git SHA.
- The frontend MUST NOT own Supabase schema or migrations.
- Frontend changes that depend on a backend schema or read-contract change MUST declare the minimum compatible backend release tag in the frontend PR description and in `notio/docs/log.md`, using the exact `notio-backend_v<version>` tag.
- The frontend release PR checklist MUST include: "Does this frontend release require a minimum backend release? If yes, name the backend tag."
- The product-level `notio/docs/` documentation MAY describe cross-component architecture, but component-owned release/deploy mechanics MUST name the owning component explicitly.
- Release manifest tests MUST cover explicit basename `notio-backend` for path `notio/backend`, explicit basename `notio-frontend` for path `notio/frontend`, duplicate basename rejection, underscore-in-basename rejection, and tag detection using configured basename rather than path leaf.

## Consequences

### Positive

- frontend and backend release history matches their actual development and deployment independence
- file layout makes component ownership explicit
- Supabase ownership is unambiguous and remains with the backend
- frontend page version has a clear source of truth
- backend deploy, frontend deploy, and release tags can evolve independently

### Negative

- release-unit migration must update CI path filters, release manifests, deploy scripts, and documentation links
- compatibility between frontend and backend-owned read contracts becomes explicit operational work
- existing Notio docs and references must be updated to avoid stale `notio/` backend paths
- one product family now has two release histories instead of one

## Non-Goals

- Defining a new Supabase schema or changing existing migrations.
- Changing Telegram ingress behavior.
- Changing frontend product scope or browse behavior.
- Introducing a backend API or BFF for the frontend.
- Moving files as part of this ADR.
- Defining a full compatibility matrix beyond the ownership rule that frontend schema dependencies must reference the backend release that introduced them.
