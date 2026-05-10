---
title: "Spec: Skeleton Loading State for clipdeck Library"
date: 2026-05-10
model: gpt-5.5
description: "DOM contract, behavior rules, and enumerated tests for replacing the centered Loading… text with shimmer card placeholders while /api/items is in flight"
status: draft
artifact_type: spec
---

# Spec: Skeleton Loading State for clipdeck Library

## Goal

While `GET /api/items` is in flight, clipdeck's library page MUST render skeleton placeholders shaped like real `.item` cards in place of the existing centered `Loading…` text, owned by the clipdeck frontend.

## Public interface

### DOM contract

While items are loading, the library section MUST contain a `[data-skeleton]` element with at least 3 child elements each matching the selector `.skeleton-item`. The legacy `[data-loading]` element MUST NOT be visible (its `hidden` attribute MUST remain set, or the element MUST be removed).

When items have loaded, the `[data-skeleton]` element MUST be removed from the DOM (or its `hidden` attribute set to `true`) and the populated `[data-sections]` element MUST be visible.

### Element shape

Each `.skeleton-item` element:

- uses the same card chrome as a real `.item` card (same width behavior, padding, border-radius, and minimum height) so that replacing skeletons with real cards does not cause avoidable layout shift;
- MUST be marked `aria-hidden="true"`;
- MUST NOT be focusable (no `tabindex >= 0`, no interactive element children);
- MUST NOT contain any text content from the source items.

### Toolbar visibility

The library toolbar (`<header class="toolbar">` containing the title, version, and reload control) MUST be visible while skeletons are rendered. The skeleton state replaces only the sections grid, not the entire library.

## Behavior rules

### Lifecycle

- On initial page load the skeleton MUST be visible from the moment `GET /api/items` is dispatched until the response resolves (success or error).
- On a Reload action that triggers a refetch, the skeleton MUST replace the currently rendered items for the duration of the refetch.
- On fetch success the skeleton MUST be removed before any real item is rendered. The DOM MUST NOT contain both `[data-skeleton]` and a populated `[data-sections]` simultaneously.
- On fetch error (network failure, non-2xx response, or JSON parse failure) the skeleton MUST be removed before the retryable shell and error toast are surfaced.

### Suppression of the legacy loading element

- The element matching `[data-loading]` MUST remain hidden in every reachable application state once this spec is implemented. No code path may unset its `hidden` attribute.
- The skeleton element is the only loading affordance for the library. The toolbar's `Reload` button MAY remain enabled during a refetch; that is out of scope for this spec.

### Accessibility

- The skeleton container MUST carry `aria-hidden="true"` so assistive tech does not announce placeholder shapes.
- The skeleton container MUST NOT include `aria-busy` on the root document or any role that would announce a loading state separately from existing toast/error feedback. Loading announcement remains the existing toast contract.

### Animation

- Each `.skeleton-item` MUST have a perceptible shimmer or pulse animation (CSS animation or transition).
- The animation MUST respect `prefers-reduced-motion: reduce`: in that media-query state the animation MUST be disabled (the skeleton remains visible but static).

### No item data

- The skeleton MUST NOT contain any text, attribute, or data property that originated in any item received from `/api/items`. The skeleton is constructed once and is not parameterized by item content.

## Tests

Each test corresponds to a behavior rule and defines the failure surface. An implementation that does not pass each test below is not done. Tests MUST live in `clipdeck/test/frontend.test.ts` (or a new sibling file imported alongside it) and MUST run under the existing vitest + jsdom harness.

1. Before `fetch` resolves on initial load, the document contains exactly one `[data-skeleton]` element.
2. The `[data-skeleton]` element contains at least 3 child elements matching `.skeleton-item`.
3. After `fetch` resolves successfully and items render, the document contains zero `[data-skeleton]` elements.
4. After a successful fetch, the populated `[data-sections]` element is visible (its `hidden` attribute is unset or `false`).
5. After a `fetch` rejection (network failure), the document contains zero `[data-skeleton]` elements.
6. After a non-2xx response, the document contains zero `[data-skeleton]` elements.
7. After a JSON parse failure, the document contains zero `[data-skeleton]` elements.
8. Clicking the `[data-reload]` button while items are visible re-renders the `[data-skeleton]` element and removes the previously rendered items before the refetch resolves.
9. Across all states (initial load, after success, after error, during reload), the `[data-loading]` element is either absent or has `hidden=true`.
10. The `<header class="toolbar">` element is visible (no ancestor has `hidden` set) while the skeleton is on screen.
11. The `[data-skeleton]` element has the attribute `aria-hidden="true"`.
12. No `.skeleton-item` contains a focusable descendant (no element with `tabindex >= 0` or an interactive tag like `<button>`, `<a>`).
13. No `.skeleton-item` text content matches any text content from the items returned by the mocked fetch.
14. The stylesheet contains a `@media (prefers-reduced-motion: reduce)` rule that disables `.skeleton-item` animation (`animation: none`, `animation-name: none`, or `animation-duration: 0s`).

## Done criteria

- The DOM contract above is implemented in `clipdeck/src/static/index.html`, `clipdeck/src/static/app.css`, and `clipdeck/src/static/app.js`.
- All tests in the Tests section pass under `./scripts/run_silent.sh "tests" npm test`.
- `./scripts/run_silent.sh "build" npx tsc --noEmit` is green.
- This spec moves to `clipdeck/docs/specs/implemented/` once the above are met.
