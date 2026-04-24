---
title: ADR-006 Platform, Hosting, and Repo Layout for mvp_01 Frontend
status: Accepted
date: 2026-04-23
---

# ADR-006: Platform, Hosting, and Repo Layout for mvp_01 Frontend

## Status

Accepted

## Related ADRs

- **Frontend ADR-001** — architectural shape (direct, read-only Supabase); this ADR picks the concrete SDK and language for the "feature-owned read protocol" it mandates.
- **Frontend ADR-002** — auth/security model; this ADR names the env-var mechanism that injects the publishable/anon key without ever touching the service-role key.
- **Frontend ADR-003** — product scope; this ADR picks a platform that can reach the pinned state set and magic-link sign-in method.
- **Frontend ADR-004** — read-model contract; the chosen stack's Supabase SDK issues the explicit-column select.
- **Frontend ADR-005** — single-user data model; this ADR hosts exactly one user with no multi-device, multi-account, or multi-tenant plumbing.

## Context

Every prior frontend ADR deliberately deferred the platform/stack question. Before a spec can be written, the following must be decided:

- the language and framework the frontend is built in
- the Supabase SDK used
- where the code lives in this repository
- the CI workflow that tests and builds it
- where the built artifact is hosted
- how the Supabase URL and publishable/anon key reach the running client

None of these choices are spec-level — each is a real architectural constraint that downstream components (protocol module placement, test framework, CI gate, deploy pipeline) depend on.

## Decision

The `mvp_01` frontend is a **static, single-page web app** with the following stack and topology:

- **Language**: TypeScript
- **Framework**: Svelte
- **Build tool**: Vite
- **Package manager**: npm (aligns with the repo's existing Node/TypeScript toolchain; `scripts/run_silent.sh` wraps `npm test`)
- **Supabase SDK**: `@supabase/supabase-js`
- **Hosting target**: Cloudflare Pages, static output only (no Pages Functions, no SSR, no edge workers for `mvp_01`)
- **Deployment subdomain**: a dedicated subdomain of `enoa.ai` parallel to the capture-side `inbox.enoa.ai` (the concrete name is spec/deploy-level)
- **Repo layout**: `notio/frontend/` as a subdirectory of the existing `notio/` project
- **CI workflow**: a dedicated `.github/workflows/notio-frontend-core.yml` that installs only this project's dependencies and runs only this project's tests (per `CLAUDE.md` §Per-Project CI Isolation)
- **Config injection**: Vite build-time env vars, specifically `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, read in exactly one config module; `.env.example` checked in, real `.env` gitignored

## Rationale

- **Web SPA over native iOS/macOS/Android.** The product is explicitly personal/discovery (ADR-005). A web client costs nothing to install, runs on every device the user already owns, and ships to the user through a `git push` rather than through TestFlight/App Store. Native polish and on-device offline storage would be nice but are not product goals for `mvp_01`.
- **TypeScript + Svelte + Vite.** The smallest practical toolchain that still gives typed Supabase responses and a first-class dev-server/HMR loop. Svelte's runtime is tiny, its component model is minimal, and it matches the "thin client" shape ADR-001 insists on. Vite gives free env-var injection and static build output that Cloudflare Pages serves as-is.
- **`@supabase/supabase-js`.** The most mature Supabase SDK; first-class Vite examples; supports `auth.signInWithOtp` (magic link, per ADR-003).
- **Cloudflare Pages.** The repo already uses Cloudflare (Tunnel for the capture service). Pages is free, global, static, and requires no server-side runtime, which is what ADR-001 asks for ("no BFF for this slice"). No Pages Functions means no accidental drift into a BFF.
- **`notio/frontend/` subdirectory.** Keeps the product ("notio") as one top-level unit while respecting the repo's per-project CI isolation rule. A sibling `notio-frontend/` would invite tighter coupling assumptions (shared `package.json`, shared tests) that Per-Project CI Isolation explicitly forbids.
- **`VITE_*` env vars.** Vite only exposes variables prefixed `VITE_*` to the client, which structurally prevents a service-role key from being bundled — it would have to be misnamed `VITE_SUPABASE_SERVICE_ROLE_KEY` to leak, which a build-time check can reject.

## Architectural Shape

### Directory layout

```
notio/
  frontend/
    package.json
    tsconfig.json
    vite.config.ts
    index.html
    src/
      main.ts                    # composition root; imports createClient from @supabase/supabase-js
      app.svelte
      config.ts                 # sole reader of import.meta.env.VITE_*
      browse/                   # feature module (per ADR-001)
        BrowseItemsReader.ts    # feature-owned read protocol (interface)
        SupabaseBrowseItemsReader.ts  # data adapter; imports @supabase/supabase-js
        BrowseView.svelte
        ...
      auth/
        AuthSession.ts           # auth protocol (interface)
        SupabaseAuthSession.ts   # auth adapter; imports @supabase/supabase-js
        ...
    tests/
    .env.example
    .gitignore                  # includes .env
```

### CI

A new workflow `.github/workflows/notio-frontend-core.yml`:

- installs deps from `notio/frontend/package.json` only
- runs TypeScript typecheck, unit tests (Vitest), and build (`vite build`)
- does not install or invoke any other project's dependencies
- dispatched by the repo-level `ci.yml` via a path filter on `notio/frontend/**`

### Deployment

- `vite build` emits a static bundle in `notio/frontend/dist/`.
- Cloudflare Pages (project created out-of-band for `mvp_01`) builds and serves that bundle.
- The Pages project configures `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build-time environment variables.

## Security Model

Deferring to ADR-002 §Security Model with these ADR-006 specifics:

- The only Supabase key reaching the browser is `VITE_SUPABASE_ANON_KEY`, which MUST be the publishable/anon key.
- `VITE_*` is the entire surface of build-time-exposed variables; anything not matching that prefix cannot be read by client code and thus cannot leak through the bundle.
- Cloudflare Pages is a static host for `mvp_01`; no Pages Functions, no edge-workers, no server secret store for this slice.

## Alternatives Considered

### 1. Web SPA (TypeScript + Svelte + Vite) on Cloudflare Pages (chosen)

Pros: zero-install for the user; fastest iteration; one runtime; reuses existing Cloudflare footprint; Vite's `VITE_*` boundary removes a whole class of secret-leak mistakes; Svelte is the smallest non-toy framework with a Supabase-friendly story.

Cons: introduces TypeScript/Node tooling alongside the Swift capture side; requires the user to authenticate in a browser rather than a dedicated app.

### 2. SwiftUI iOS/macOS app

Rejected for `mvp_01`.

Pros: language continuity with the capture side; `supabase-swift` exists; native UX.
Cons: TestFlight/codesigning overhead; App Store friction; per-device install; much slower iteration loop; no product requirement justifies native for a single personal user browsing a list.

### 3. React SPA (TypeScript + React + Vite)

Rejected for `mvp_01` (close second).

Pros: larger ecosystem; more documentation; familiar to more people.
Cons: larger runtime and a heavier component model than this product needs; no product gain over Svelte for a single browse view. Swap-in is cheap if the framework choice turns out to matter — the feature-owned read protocol is framework-agnostic.

### 4. SvelteKit (SSR-capable meta-framework)

Rejected for `mvp_01`.

Pros: routing and build conventions out of the box.
Cons: adds SSR/edge-function capability that this slice explicitly doesn't want (ADR-001 bans a BFF); tempts the frontend into server-side code paths. Plain Svelte + Vite is smaller and more constrained.

### 5. Sibling `notio-frontend/` project

Rejected.

Pros: clearer independence.
Cons: visually suggests a separate product; Per-Project CI Isolation is already satisfied by a dedicated `notio-frontend-core.yml`; keeping the frontend under `notio/` reflects the product relationship.

## Consequences

### Positive

- Concrete platform, concrete SDK, concrete repo location — the spec can name files and imports without "TBD".
- Config injection has a structural safety boundary (`VITE_*` prefix) that dovetails with ADR-001/002 enforcement.
- Deployment is "git push → Cloudflare Pages build" — no VPS involvement for the frontend.
- Cross-project CI isolation is satisfied out of the gate.

### Negative

- Adds a Node/TypeScript toolchain to a repo whose other active product (notio capture) is Swift.
- A Cloudflare Pages build-var change is the one piece of config state that isn't in git (acceptable — it's the same trust model as the existing capture env vars on the VPS).
- Any future need for SSR, edge rendering, or shared frontend code will require revisiting this ADR.

## Enforcement

- The frontend CI workflow MUST be `.github/workflows/notio-frontend-core.yml`, installing only `notio/frontend/` dependencies and running only `notio/frontend/` tests.
- The Vite build MUST fail if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is unset (explicit check in `config.ts` or `vite.config.ts`).
- No env var starting `VITE_SUPABASE_SERVICE` (or any name that would be interpretable as a service-role key) MUST appear in the frontend codebase or in any `.env*` file tracked by git; a grep-based CI check rejects such references.
- The frontend MUST NOT deploy a Cloudflare Pages Function or any server-side runtime for `mvp_01`; the Pages project is static-only.
- `@supabase/supabase-js` MUST be imported only from the allowed modules listed in ADR-001 §Enforcement: `main.ts` (composition root), `SupabaseBrowseItemsReader.ts` (data adapter), and `SupabaseAuthSession.ts` (auth adapter).
- PR review checklist item: "no new Node dependencies outside `notio/frontend/package.json`; no new server-runtime code on the Pages target."

## Non-Goals

This ADR does not define:

- the concrete subdomain name under `enoa.ai` (deploy-level)
- routing structure or component tree (spec-level)
- test framework specifics beyond "Vitest for unit, nothing else required for `mvp_01`"
- native iOS/macOS/Android clients
- PWA / offline support (explicitly excluded by ADR-001)
- SSR, edge functions, or any server-side rendering
- a design system, component library, or styling approach

## Review Trigger

Revisit this ADR if any of the following become true:

- the product needs to run on iOS, macOS, or Android natively
- SSR or server-rendered routes become a product requirement
- Cloudflare Pages is no longer a suitable host (feature, pricing, or availability change)
- another Supabase-backed frontend in this repo wants to share frontend code
- the product moves beyond single-user (ADR-005 review trigger also fires this one)
- TypeScript or Svelte stops being the best fit for the team
