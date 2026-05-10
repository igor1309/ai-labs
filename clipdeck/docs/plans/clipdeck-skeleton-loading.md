---
title: "Plan: Skeleton Loading State"
date: 2026-05-10
model: claude-opus-4-7
description: "Step-by-step TDD plan to implement spec-skeleton-loading.md, replacing the centered Loading… text with shimmer card placeholders while /api/items is in flight"
status: draft
artifact_type: plan
spec: clipdeck/docs/specs/spec-skeleton-loading.md
---

# Plan: Skeleton Loading State

## Source of truth

[`clipdeck/docs/specs/spec-skeleton-loading.md`](../specs/spec-skeleton-loading.md). This plan does not redefine behavior; it sequences the work to satisfy that spec.

## Execution Lock

- Execution mode: auto-continue
- Human review between tasks: no
- Worktree mode: create new
- Expected worktree: `worktrees/clipdeck-skeleton-loading`
- Expected branch: `codex/clipdeck-skeleton-loading`
- Push policy: push at closeout
- Push boundary: push only after all steps are green and the archive step has landed on the feature branch; PR opened with `gh pr create`, then auto-merge enabled with `gh pr merge <num> --merge --auto --delete-branch`
- Final archive behavior: the archive move is the last commit on the feature branch before pushing; both spec and plan move to their `implemented/` directories atomically with the code that satisfies them. No follow-up commit, no follow-up PR.
- Preflight check: [x] done

## Pre-flight

Before Step 1:

- run `git worktree list --porcelain`
- run `git branch --show-current`
- capture the current worktree path and branch
- if the current worktree is not `worktrees/clipdeck-skeleton-loading` on `codex/clipdeck-skeleton-loading`, create the expected worktree from up-to-date `trunk`, enter it, and rerun the worktree and branch checks
- emit `Preflight: worktree=<path>, branch=<branch>, separate_worktree=<pass|fail>`
- confirm `separate_worktree=pass`
- confirm `git status --short` is empty
- confirm `./scripts/run_silent.sh "tests" npm test` is green
- confirm `./scripts/run_silent.sh "build" npx tsc --noEmit` is green
- mark `Preflight check: [x] done` only after the checks above pass

If any of these fail, stop and surface the failure — do not start the plan.

## Steps

Each step is one RED-GREEN-REFACTOR cycle followed by a targeted test run, step closeout, one implementation commit, and one plan-tracker commit. Steps are ordered by dependency. Do not bundle multiple behavior steps into one implementation commit.

For every implementation step:

- run the step's targeted verification before committing
- self-review the step against this plan and `spec-skeleton-loading.md`
- fix any self-review fail/warning, rerun the step verification, and commit the fix before continuing
- mark the step tracker checkbox only after verified evidence exists
- commit the plan tracker update before continuing

### Step 1 — Skeleton DOM is rendered before fetch resolves

- [x] Step 1 complete
- **RED:** add a test asserting that immediately after `await import("../src/static/app.js")` and before `flushAsync()`, the document contains exactly one `[data-skeleton]` element. Mock fetch with a never-resolving promise so the skeleton is the steady state.
- **GREEN:** add `[data-skeleton]` markup to `index.html` (initially visible) or render it from `app.js` before the first `fetch`.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: render skeleton element on initial load`

### Step 2 — Skeleton contains at least 3 `.skeleton-item` placeholders

- [x] Step 2 complete
- **RED:** test asserts `[data-skeleton]` has ≥3 children matching `.skeleton-item`.
- **GREEN:** populate three `.skeleton-item` children, either in HTML or via a builder function in `app.js`.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: populate skeleton with three placeholder rows`

### Step 3 — Skeleton accessibility attributes

- [x] Step 3 complete
- **RED:** tests assert `[data-skeleton]` has `aria-hidden="true"`, every `.skeleton-item` has `aria-hidden="true"`, and no `.skeleton-item` contains a focusable descendant.
- **GREEN:** add `aria-hidden="true"` to the container and each placeholder, ensure children are non-interactive (use `<div>` not `<button>`/`<a>`).
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: mark skeleton placeholders as aria-hidden and non-focusable`

### Step 4 — Skeleton card shape and shimmer styling

- [x] Step 4 complete
- **RED:** test reads `src/static/app.css`, extracts the `.item` and `.skeleton-item` CSS blocks, and asserts `.skeleton-item` declares matching card chrome (`width`, `padding`, `border-radius`, non-zero `min-height`) plus a non-empty animation declaration. Do not rely on JSDOM computed style unless the stylesheet is explicitly injected into the test DOM.
- **GREEN:** add CSS for `.skeleton-item` mirroring `.item` dimensions and a shimmer keyframe animation in `app.css`.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: style skeleton items with card shape and shimmer animation`

### Step 5 — Reduced-motion support

- [x] Step 5 complete
- **RED:** test reads `src/static/app.css` and asserts a `@media (prefers-reduced-motion: reduce)` rule disables `.skeleton-item` animation with `animation: none`, `animation-name: none`, or `animation-duration: 0s`.
- **GREEN:** add `@media (prefers-reduced-motion: reduce) { .skeleton-item { animation: none; } }` to `app.css`.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: disable skeleton animation under prefers-reduced-motion`

### Step 6 — Skeleton is removed on successful fetch

- [x] Step 6 complete
- **RED:** test mocks `fetch` to resolve with one section/one item, awaits `flushAsync`, asserts zero `[data-skeleton]` elements remain and `[data-sections]` is populated.
- **GREEN:** in `renderSections`, remove `[data-skeleton]` (or set hidden) before appending real sections.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: remove skeleton when items render`

### Step 7 — Skeleton is removed on fetch error paths

- [x] Step 7 complete
- **RED:** three tests, one per failure mode (`fetch` rejection, non-2xx response, JSON parse failure). Each asserts that after the failure path runs, zero `[data-skeleton]` elements remain.
- **GREEN:** in each catch branch of `loadItems()`, remove the skeleton before showing the retryable shell and error toast.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: remove skeleton on fetch failure paths`

### Step 8 — Suppress legacy `[data-loading]` element

- [ ] Step 8 complete
- **RED:** test asserts that across the lifecycle (before resolve, after success, after error, after reload) the `[data-loading]` element's `hidden` attribute is `true` and its `textContent` is empty.
- **GREEN:** remove all writes to `elements.loading.hidden = false` and clear its text content. Leave the element in the DOM with `hidden` set, or remove it entirely from `index.html`.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: drop legacy Loading… element in favor of skeleton`

### Step 9 — Reload re-shows skeleton

- [ ] Step 9 complete
- **RED:** test loads items, then mocks a second never-resolving fetch, clicks `[data-reload]`, and asserts a `[data-skeleton]` element is present and previously rendered items are removed.
- **GREEN:** in the reload handler (or `loadItems()`), re-mount the skeleton and clear `[data-sections]` before issuing the new fetch.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: show skeleton during reload refetch`

### Step 10 — Toolbar remains visible during skeleton

- [ ] Step 10 complete
- **RED:** test mounts the skeleton state and asserts `<header class="toolbar">` is visible (no ancestor `hidden`).
- **GREEN:** verify the skeleton replaces only `[data-sections]` content, not the library wrapper. Adjust if Step 1's implementation hid the wrong scope.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: keep toolbar visible during skeleton state`

### Step 11 — Skeleton text isolation regression

- [ ] Step 11 complete
- **RED:** test mocks fetch with a single item whose title is a unique sentinel string; while a second fetch is pending (reload), asserts no `.skeleton-item` text content matches the sentinel.
- **GREEN:** confirm the skeleton builder takes no parameters and renders no item-derived text. Add a comment explaining why if non-obvious.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: regression test that skeletons carry no item text`

### Step 12 — Archive spec and plan

- [ ] Step 12 complete
- **Action only (no test):** `git mv clipdeck/docs/specs/spec-skeleton-loading.md clipdeck/docs/specs/implemented/` and `git mv clipdeck/docs/plans/clipdeck-skeleton-loading.md clipdeck/docs/plans/implemented/`. Update `clipdeck/docs/log.md` with a one-line entry for this change.
- **Verify:** `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "build" npx tsc --noEmit` both green.
- **Commit:** `clipdeck: archive skeleton-loading spec and plan`

## Pre-push gate

Before pushing the feature branch:

- `./scripts/run_silent.sh "tests" npm test` is green
- `./scripts/run_silent.sh "build" npx tsc --noEmit` is green
- all 14 tests from `spec-skeleton-loading.md` map to a passing test
- the plan covers the additional element-shape requirement that every `.skeleton-item` has `aria-hidden="true"`
- the archive commit (Step 12) is the tip of the branch
- `clipdeck/docs/log.md` has the one-line entry

## Closeout

- `git push -u origin codex/clipdeck-skeleton-loading`
- `gh pr create --title "clipdeck: skeleton loading state" --body "<reference to spec-skeleton-loading.md and a brief summary>"`
- `gh pr merge <num> --merge --auto --delete-branch`
- merge completes the work — no follow-up commits required
