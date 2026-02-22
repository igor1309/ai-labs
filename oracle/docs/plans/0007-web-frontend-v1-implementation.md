---
date: 2026-02-22
model: gpt-5
description: "Implementation plan for Am I done web v1 polish and Cloudflare Pages delivery"
---

# Web Frontend v1 Implementation Plan

## Architecture Conformance Verification
This plan is validated against:
- `oracle/docs/am-i-done-architecture.md`
- `oracle/docs/decisions/0002-composition-root-and-testing.md`
- `oracle/docs/composition-root-wiring-guide.md`
- `oracle/docs/decisions/0003-web-frontend-v1-foundations.md`

Conformance checks:
1. Frontend boundary: web module owns UI/DTOs and does not import core modules.
Result: pass. Current web app uses runtime HTTP contract only.
2. API routing: frontend uses same-origin `POST /api/outlook`.
Result: pass. Current app calls `/api/outlook`; plan keeps this unchanged.
3. Locale policy: v1 sends `en-US`.
Result: pass. Current app sends `locale: "en-US"`; plan keeps this unchanged.
4. State semantics: `needsClarification` is success (`received`), transport/timeout is `failed`.
Result: pass. Current UI behavior matches this; plan preserves and tests it.
5. Composition-root rules: no frontend leakage of Worker/provider wiring.
Result: pass. Plan keeps Cloudflare Pages proxy details in deployment/runtime layer, not domain/UI logic.

## Goal
Deliver a polished v1 web experience while preserving locked architecture constraints and same-origin deployment through Cloudflare Pages.

## Scope
In scope:
- Web UI structure/polish and maintainability improvements in `oracle/apps/am-i-done-web/src/*`.
- Same-origin `/api/*` routing through Cloudflare Pages runtime.
- Automated coverage for happy, clarification, and transport-failure flows.
- Deployment runbook and required runtime configuration for Pages.

Out of scope:
- Streaming responses.
- Accounts/personalization.
- v2 locale auto-detection implementation (only planned interface boundary is documented).

## Implementation Steps

### Step 1: Stabilize Web App Structure (No Behavior Change)
Changes:
- Refactor `oracle/apps/am-i-done-web/src/app.js` into small units:
  - state transition handling (`idle`, `submitting`, `received`, `failed`)
  - request effect with timeout
  - DOM rendering helpers for answer/clarification/error
- Keep all existing payload fields and selectors.

Verification:
- `./scripts/run_silent.sh "tests" npm test`
- Confirm web e2e tests stay green.

Commit:
- `refactor web app structure`

### Step 2: Polish UI Presentation (Behavior Preserved)
Changes:
- Improve hierarchy and readability in:
  - `oracle/apps/am-i-done-web/src/index.html`
  - `oracle/apps/am-i-done-web/src/styles.css`
- Keep semantic sections and stable `data-testid` hooks.
- Improve loading/error/clarification/answer readability without changing API behavior.

Verification:
- `./scripts/run_silent.sh "tests" npm test`
- Manual browser spot-check for each state.

Commit:
- `polish web ui presentation`

### Step 3: Lock Same-Origin Pages Routing Contract
Changes:
- Ensure Pages routing remains the only frontend network path:
  - frontend fetch calls `/api/outlook` only.
  - Pages runtime proxies `/api/*` using `API_BASE_URL`.
- Keep runtime config in web deployment files and npm scripts.

Verification:
- `./scripts/run_silent.sh "tests" npm test`
- Confirm proxy tests and web e2e pass.

Commit:
- `lock pages same-origin routing`

### Step 4: Deployment Runbook and CI Readiness
Changes:
- Document required Pages deployment inputs and commands:
  - required `API_BASE_URL`
  - web deploy command
  - worker deploy dependency ordering
- Keep docs in Oracle docs set consistent with inventory/decision records.

Verification:
- `./scripts/run_silent.sh "tests" npm test`
- Dry-run command validation in CI/dev environment.

Commit:
- `document web deployment runbook`

## Done Criteria
- Web v1 remains architecture-compliant with locked decisions.
- Same-origin `/api/outlook` path is the only browser integration path.
- UI clearly supports all three product flows:
  - happy path answer rendering
  - clarification rendering
  - transport/timeout failure rendering
- Full test suite passes after each step.
