---
title: ADR-007 Frontend Deployment Verification by Page Version
status: Accepted
date: 2026-04-24
model: gpt-5
description: "Requires Notio frontend deployments to verify the deployed Cloudflare Pages app by reading the rendered page version."
---

# ADR-007: Frontend Deployment Verification by Page Version

## Executive Summary

Notio frontend deployment success is defined by the deployed Cloudflare Pages app rendering the expected frontend release version.
The deploy workflow MUST verify the production page after deploy by loading the real page and reading the visible version text.
For tag-triggered deploys, the expected version comes from the triggering `notio-frontend_v<version>` tag and MUST match the page-rendered `v<version>` text.
For manual or ref-based production deploys, the expected version comes from the checked-out `notio/frontend/package.json` version and MUST match the page-rendered `v<version>` text.
This complements Frontend ADR-006 static Pages hosting and Notio ADR-007 frontend release identity.
This ADR does not introduce browser interaction coverage for Notio product behavior.

## Context

The Notio frontend is a static Svelte/Vite app deployed to Cloudflare Pages.
Frontend release identity is independent from backend release identity, and Notio ADR-007 requires the visible frontend version to come from frontend release metadata without a Git SHA.

The current deployment path can prove that the app built and that Wrangler accepted a Pages deployment.
That is not enough to prove that the production URL is serving the release that triggered the deploy.
Cloudflare Pages can also produce preview deployments, and a successful deploy command can still leave production traffic on a prior version if the wrong branch or target is used.

The backend already treats runtime version verification as a release success condition through its `/version` endpoint.
The frontend has no server endpoint and should remain static-only under Frontend ADR-006, so the equivalent deployment assertion must read the rendered page.

The rejected alternatives are:

- Trusting `wrangler pages deploy` success alone is rejected because it proves upload acceptance, not production runtime identity.
- Adding a frontend `/version` API endpoint is rejected because Frontend ADR-006 keeps the Pages deployment static-only.
- Checking raw `index.html` with `curl` is rejected because the Svelte-rendered version is client-rendered and may live in bundled JavaScript rather than raw HTML.
- Comparing Cloudflare deployment IDs is rejected because it verifies platform metadata rather than the user-visible app surface.

## Decision

Every production Notio frontend deployment MUST run a post-deploy smoke check against the real deployed page.

The smoke check MUST:

- derive the expected frontend version from the triggering `notio-frontend_v<version>` tag when the deploy is tag-triggered
- derive the expected frontend version from checked-out `notio/frontend/package.json` when the deploy is manual or ref-based
- load the production Notio frontend URL after deployment
- read the browser-rendered page, not only the raw HTML response
- find the visible version element exposed by the app
- assert that the rendered version text equals `v<version>`

For example, a deployment triggered by `notio-frontend_v0.1.1` must verify that the production page renders `v0.1.1`.
A manual production deployment of a checkout whose `notio/frontend/package.json` version is `0.1.1` must verify the same rendered text.

The smoke check is a deployment gate, not a general UI test suite.
If the version does not match, the deployment MUST be treated as failed even if build, unit tests, and Wrangler deployment succeeded.

## Rules / Invariants

- The Notio frontend deployment workflow MUST verify the deployed production page after `wrangler pages deploy`.
- For tag-triggered deploys, the expected version MUST be derived from the exact frontend release tag `notio-frontend_v<version>`.
- For manual or ref-based production deploys, the expected version MUST be derived from the checked-out `notio/frontend/package.json` version.
- The expected rendered text MUST be `v<version>`, with the `notio-frontend_` tag prefix stripped.
- The implementation MUST have a static workflow or script test that covers both expected-version sources: tag-derived and package-json-derived.
- The smoke check MUST use a browser-rendered DOM mechanism such as Playwright, not a raw `curl` HTML grep.
- The version element MUST remain present on every frontend auth state, including checking, unauthenticated, and authenticated states.
- The version element MUST remain accessible by a stable selector or accessible name; the current selector is the element with accessible name `Version`.
- The deployment workflow MUST fail if the production page cannot be reached, the version element cannot be found, or the rendered version differs from the expected version.
- The verification target MUST be the production frontend URL, not a local dev server and not a preview URL, unless a future ADR explicitly defines preview-deploy verification.
- The production URL MUST be supplied through workflow configuration or environment, not duplicated across scripts.
- The smoke check MUST NOT authenticate, mutate Supabase data, or depend on backend data availability.
- The smoke check MUST NOT add a Pages Function, server route, or backend-owned endpoint for frontend version verification.

## Consequences

### Positive

- Frontend release success is tied to what the user can actually load.
- Wrong-branch or preview-only deploy mistakes are caught by the release workflow.
- The existing visible version display becomes operationally useful, not only informational.
- The frontend keeps its static-only Cloudflare Pages architecture.

### Negative

- The deployment workflow needs a browser-capable smoke check dependency.
- Cloudflare propagation or transient page-load failures can fail an otherwise valid deploy and require retry discipline.
- A UI selector for the version display becomes part of the deployment contract.

### Future Extension Points

- Preview deployment verification may later read the same page version from the preview URL before promoting to production.
- The version display may later expose a machine-readable attribute in addition to visible text, as long as the visible `v<version>` assertion remains.
- A shared release-smoke helper may be introduced if other static frontend release units adopt the same pattern.

## Non-Goals

- Defining the exact script file, package dependency, or workflow YAML implementation.
- Testing login, Supabase reads, browse pagination, or authenticated frontend behavior.
- Replacing unit tests, typecheck, or Vite build gates.
- Adding a frontend API endpoint, Cloudflare Pages Function, SSR route, or backend proxy.
- Verifying the backend release version or backend/frontend compatibility matrix.
- Defining preview deployment promotion policy.
