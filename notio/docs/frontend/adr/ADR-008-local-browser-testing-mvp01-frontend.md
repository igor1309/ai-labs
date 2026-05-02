---
title: ADR-008 Local Browser Testing for mvp_01 Frontend
status: Accepted
date: 2026-04-24
model: gpt-5
description: "Decides how the Notio frontend is tested locally in a browser without production Supabase credentials"
---

# ADR-008: Local Browser Testing for mvp_01 Frontend

## Executive Summary

The `mvp_01` frontend MUST support a local browser-testing runtime served by Vite with deterministic in-memory auth and browse adapters.

This lets a developer exercise the authenticated UI path locally without production Supabase credentials, network access, or a local Supabase stack.

The production runtime remains the direct read-only Supabase client decided by Frontend ADR-001 and Frontend ADR-006.

This ADR governs local browser testing only; it does not introduce a backend-for-frontend, Storybook, production mocks, or alternate deployment topology.

## Context

The current frontend can render the unauthenticated login screen through `vite dev`, but the authenticated browse path depends on a live Supabase project and valid credentials. That makes local visual and interaction testing of the item grid, refresh behavior, pagination, empty states, and failure states slower than the product needs.

The decision is constrained by the accepted frontend ADRs and by the need for an offline local workflow.

- Frontend ADR-001 requires a thin direct-read Supabase client for production and forbids a BFF for `mvp_01`.
- Frontend ADR-002 requires that privileged Supabase credentials never reach the browser.
- Frontend ADR-003 defines the closed browse state set and product scope.
- Frontend ADR-006 chooses Svelte + Vite and requires `notio/frontend/` to remain a static SPA hosted on Cloudflare Pages.
- The local testing path must work without production secrets and should work offline.

The main rejected alternatives were local Supabase, Storybook-only previews, and production Supabase in local development.

- **Local Supabase**: closer to production, but Docker setup, migrations, auth seed data, and local email behavior are disproportionate for routine UI inspection.
- **Storybook or component previews**: useful later for isolated component states, but not enough for the full app shell, sign-in transition, refresh, and pagination flow.
- **Production Supabase in local dev**: keeps wiring simple, but requires real secrets and network access and risks testing against mutable data.

## Decision

The Notio frontend will have a dedicated **local browser-testing runtime** selected only for local development.

When that runtime is selected, the Vite app MUST mount the same Svelte app and route through the same public `AuthSession` and `BrowseItemsReader` interfaces used by production, but the composition root MUST wire deterministic in-memory implementations instead of Supabase-backed adapters.

The local runtime MUST be runnable from `notio/frontend/` with one npm script, named `dev:local`, and served by Vite to a localhost URL.

The local runtime MUST NOT require `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, production Supabase access, Docker, or internet access.

Production, preview, and CI build paths continue to use the real Supabase adapters and the existing build-time config checks.

## Rules / Invariants

- `notio/frontend/package.json` MUST expose `dev:local` for launching the local browser-testing runtime.
- The local browser-testing runtime MUST be selected by an explicit local-only mode or env flag, not by absence of Supabase configuration.
- The production composition root MUST keep using `SupabaseAuthSession` and `SupabaseBrowseItemsReader`.
- The local composition root or local-mode branch MUST use in-memory implementations of `AuthSession` and `BrowseItemsReader`.
- Local fake adapters MUST live under `notio/frontend/src/` in a clearly local/test-named module path, not inside production Supabase adapter files.
- Local fake adapters MUST satisfy the same public interfaces as production adapters.
- The local runtime MUST expose deterministic browse scenarios for loaded, empty, refresh, load-more, load-more-exhausted, and failure states.
- The local auth flow MUST let the app enter the authenticated UI without sending email or contacting Supabase.
- The local runtime MUST NOT import `@supabase/supabase-js` through its fake adapters.
- The local runtime MUST NOT relax Frontend ADR-001's production SDK import allowlist.
- The local runtime MUST NOT introduce Cloudflare Pages Functions, a BFF, server-side rendering, or any production deployment behavior.
- CI MUST continue to run the frontend unit tests, typecheck, and production build gates; local browser-testing code must compile under the same TypeScript project.
- Documentation for running the local browser-testing runtime MUST name the `dev:local` command and state that it uses mock local data.

## Consequences

Accepted positive consequences include faster browser feedback and a smaller dependency surface for UI inspection.

- Developers can inspect the full Notio frontend in a browser with no production secrets.
- UI work gets a faster feedback loop for authenticated states and pagination.
- The production architecture stays unchanged because local behavior is isolated at composition time behind existing interfaces.
- Offline visual testing becomes possible for the browse experience.

Accepted negative consequences include reduced production fidelity for backend-owned behavior.

- Local browser testing will not validate Supabase RLS, network failures, magic-link email delivery, or real database ordering.
- The fake data set becomes a small maintenance surface when the read model changes.
- Local testing can drift from production if fake adapters are allowed to encode behavior not present in the real adapters.

Future extension points remain available without changing this decision.

- A Storybook or component-state catalog can be added later for isolated visual states.
- A local Supabase workflow can be added later for integration testing if auth/RLS behavior becomes a routine local concern.
- Browser automation can target `dev:local` once the manual local runtime exists.

## Non-Goals

This ADR explicitly excludes these details.

- the exact fake item contents
- browser automation tooling
- screenshot testing
- Storybook setup
- local Supabase setup
- Supabase migration or seed-data workflow
- production preview environments
- changes to Cloudflare Pages deployment
- changes to the production Supabase auth or read adapters
