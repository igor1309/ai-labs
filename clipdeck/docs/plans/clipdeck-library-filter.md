---
title: "Plan: Sticky Filter Input"
date: 2026-05-10
model: claude-opus-4-7
description: "Step-by-step TDD plan to implement spec-library-filter.md, adding a sticky case-insensitive substring filter over title, subtitle, and description"
status: draft
artifact_type: plan
spec: clipdeck/docs/specs/spec-library-filter.md
---

# Plan: Sticky Filter Input

## Source of truth

[`clipdeck/docs/specs/spec-library-filter.md`](../specs/spec-library-filter.md). This plan does not redefine behavior; it sequences the work to satisfy that spec.

## Execution Lock

- Execution mode: auto-continue
- Human review between tasks: no
- Worktree mode: create new
- Expected worktree: `worktrees/clipdeck-library-filter`
- Expected branch: `codex/clipdeck-library-filter`
- Push policy: push at closeout
- Push boundary: push only after all steps are green and the archive step has landed on the feature branch; PR opened with `gh pr create`, then auto-merge enabled with `gh pr merge <num> --merge --auto --delete-branch`
- Final archive behavior: the archive move is the last commit on the feature branch before pushing; both spec and plan move to their `implemented/` directories atomically with the code that satisfies them. No follow-up commit, no follow-up PR.
- Preflight check: [ ] done

## Sequencing relative to other work

This plan MUST start after `clipdeck-skeleton-loading.md` is merged to `trunk`. Step 8 below depends on the skeleton element being the canonical loading affordance. If skeleton has not yet shipped, pause and wait.

## Pre-flight

Before Step 1:

- run `git worktree list --porcelain`
- run `git branch --show-current`
- capture the current worktree path and branch
- confirm the skeleton-loading merge commit is reachable from up-to-date `trunk`; if it is not reachable, pause and wait for `clipdeck-skeleton-loading.md` to merge
- if the current worktree is not `worktrees/clipdeck-library-filter` on `codex/clipdeck-library-filter`, create the expected worktree from up-to-date `trunk`, enter it, and rerun the worktree and branch checks
- emit `Preflight: worktree=<path>, branch=<branch>, separate_worktree=<pass|fail>`
- confirm `separate_worktree=pass`
- confirm `git status --short` is empty
- confirm `./scripts/run_silent.sh "tests" npm test` is green
- confirm `./scripts/run_silent.sh "build" npx tsc --noEmit` is green
- mark `Preflight check: [x] done` only after the checks above pass

If any of these fail, stop and surface the failure — do not start the plan.

## Steps

Each step is one RED-GREEN-REFACTOR cycle followed by a targeted test run, step closeout, one implementation commit, and one plan-tracker commit. Do not bundle multiple behavior steps into one implementation commit.

For every implementation step:

- run the step's targeted verification before committing
- self-review the step against this plan and `spec-library-filter.md`
- fix any self-review fail/warning, rerun the step verification, and commit the fix before continuing
- mark the step tracker checkbox only after verified evidence exists
- commit the plan tracker update before continuing

### Step 1 — Filter input renders in DOM after items load

- [ ] Step 1 complete
- **RED:** test mocks fetch with one section/one item; after `flushAsync`, asserts the document contains exactly one `[data-filter-row]` element positioned between `<header class="toolbar">` and `[data-sections]` (DOM order), and that row contains exactly one `[data-filter-input]` element.
- **GREEN:** add markup for the filter row in `index.html` (or render from `app.js` after items load); ensure it is initially hidden until items arrive.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: render filter input after items load`

### Step 2 — Filter input attributes

- [ ] Step 2 complete
- **RED:** tests assert `[data-filter-input]` has a non-empty `placeholder` attribute and no `autofocus` attribute.
- **GREEN:** set the `placeholder` attribute (e.g., `"Filter prompts and skills…"`); ensure no `autofocus`.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: add placeholder copy to filter input`

### Step 3 — Empty filter renders all items

- [ ] Step 3 complete
- **RED:** test asserts that with the filter value empty, the rendered item count equals the count returned by the mock.
- **GREEN:** add a `currentFilter` state field defaulting to empty; have `renderSections` consult it; for empty/whitespace, render everything.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: route rendering through filter state with empty default`

### Step 4 — Substring match on title

- [ ] Step 4 complete
- **RED:** test sets the filter input value to a substring of one item's title, dispatches `input`, advances fake timers by 150ms, and asserts only items whose title contains the query are rendered.
- **GREEN:** add a debounced `input` handler that updates `currentFilter` and re-renders. Implement match: case-insensitive substring match on `item.title`. Use `vi.useFakeTimers()` in the test.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: match filter against item title (debounced 150ms)`

### Step 5 — Debounce waits for final query

- [ ] Step 5 complete
- **RED:** test types two characters within 100ms, asserts the visible item list is unchanged before the debounce interval completes, then advances fake timers by 150ms and asserts the final query result is rendered.
- **GREEN:** cancel the pending debounce timer on each input event and re-render only after the latest 150ms interval completes.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: debounce filter updates until typing settles`

### Step 6 — Match extends to subtitle and description

- [ ] Step 6 complete
- **RED:** two tests — one with a term that appears only in `subtitle`, one with a term that appears only in `description`. Each asserts the matching item is rendered.
- **GREEN:** broaden the match function to `title || subtitle || description`. Treat absent fields as no-match contribution.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: extend filter match to subtitle and description`

### Step 7 — Case-insensitivity and whitespace-only

- [ ] Step 7 complete
- **RED:** three tests — one with all-uppercase filter matching a lowercase title; one with `"   "` rendering all items; one with a padded non-empty filter such as `" review "` matching as `"review"`.
- **GREEN:** lowercase both sides; trim before checking emptiness.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: normalize filter case and treat whitespace as empty`

### Step 8 — Filter is hidden during skeleton state and when items list is empty

- [ ] Step 8 complete
- **RED:** two tests — (a) while the skeleton is on screen, `[data-filter-input]` is not rendered; (b) after a fetch returns `sections: []`, `[data-filter-input]` is not rendered.
- **GREEN:** gate filter row visibility on `state.itemsById.size > 0` and on the absence of the skeleton.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: hide filter input when no items are present`

### Step 9 — Section heading hidden when zero matches in that section

- [ ] Step 9 complete
- **RED:** test sets filter value such that one of two sections has zero matches; asserts the empty section's heading is not in the DOM.
- **GREEN:** in `renderSections`, skip the heading for any section whose post-filter item count is zero.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: hide section heading when filter empties the section`

### Step 10 — Empty-state element when zero total matches

- [ ] Step 10 complete
- **RED:** test sets filter value with zero matches; asserts `[data-filter-empty]` is rendered with text containing `"No matches"` and contains a `[data-filter-empty-clear]` button labelled `"Clear filter"`.
- **GREEN:** render the empty-state element when the post-filter total count is zero. Otherwise do not render it.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: render empty-state when filter matches zero items`

### Step 11 — Empty-state clear action

- [ ] Step 11 complete
- **RED:** test clicks `[data-filter-empty-clear]`; asserts the input value is empty, the empty-state is gone, and all items are rendered.
- **GREEN:** wire a click handler that resets `currentFilter` and the input value, focuses the input, and re-renders.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: clear filter from empty-state action`

### Step 12 — Clear button visibility and click

- [ ] Step 12 complete
- **RED:** two tests — (a) clear button is hidden when input is empty, visible when non-empty; (b) clicking the clear button resets the filter.
- **GREEN:** toggle the clear button's `hidden` attribute on input; wire its click to reset.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: add filter clear button`

### Step 13 — Escape key clears filter

- [ ] Step 13 complete
- **RED:** test focuses input, types a value, dispatches `keydown` with `key="Escape"`; asserts input is empty, all items are rendered, and the input retains focus.
- **GREEN:** add a `keydown` handler on the input.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: clear filter on Escape key`

### Step 14 — Reload clears filter

- [ ] Step 14 complete
- **RED:** test sets a filter value, clicks `[data-reload]`, asserts the input value is empty before the new items render.
- **GREEN:** in the reload handler, reset `currentFilter` and the input value.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: reset filter on reload`

### Step 15 — No storage persistence

- [ ] Step 15 complete
- **RED:** test asserts zero calls to `localStorage.getItem`/`setItem`/`sessionStorage` keyed by anything filter-related across a full lifecycle (load → filter → reload).
- **GREEN:** confirm no storage calls were introduced. (This is a regression guard.)
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: regression test that filter is not persisted`

### Step 16 — No URL persistence

- [ ] Step 16 complete
- **RED:** test loads with a query/hash containing a filter-like value, asserts the filter starts empty, then changes the filter and asserts `history.pushState` and `history.replaceState` are not called.
- **GREEN:** confirm filter state remains runtime-only and no URL reads/writes are introduced. (This is a regression guard.)
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: regression test that filter is not stored in the url`

### Step 17 — Copy contract regression

- [ ] Step 17 complete
- **RED:** test sets a filter, clicks a filtered-in item, asserts `navigator.clipboard.writeText` was called with that item's original `body` verbatim.
- **GREEN:** confirm filtering does not mutate `state.itemsById`. (Regression guard for the existing copy contract.)
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: regression test that filter preserves copy contract`

### Step 18 — Sticky positioning

- [ ] Step 18 complete
- **RED:** test reads `src/static/app.css`, extracts the `[data-filter-row]` CSS block, and asserts it declares `position: sticky` plus a concrete `top` offset. Do not rely on JSDOM computed style unless the stylesheet is explicitly injected into the test DOM.
- **GREEN:** add `position: sticky; top: 0;` (or top equal to toolbar height) to the filter row's CSS.
- **Verify:** `./scripts/run_silent.sh "tests" npm test -- frontend.test`
- **Commit:** `clipdeck: make filter row sticky to viewport top`

### Step 19 — Archive spec and plan

- [ ] Step 19 complete
- **Action only (no test):** `git mv clipdeck/docs/specs/spec-library-filter.md clipdeck/docs/specs/implemented/` and `git mv clipdeck/docs/plans/clipdeck-library-filter.md clipdeck/docs/plans/implemented/`. Update `clipdeck/docs/log.md` with a one-line entry for this change.
- **Verify:** `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "build" npx tsc --noEmit` both green.
- **Commit:** `clipdeck: archive library-filter spec and plan`

## Pre-push gate

Before pushing the feature branch:

- `./scripts/run_silent.sh "tests" npm test` is green
- `./scripts/run_silent.sh "build" npx tsc --noEmit` is green
- all 22 tests from `spec-library-filter.md` map to a passing test
- the archive commit (Step 19) is the tip of the branch
- `clipdeck/docs/log.md` has the one-line entry

## Closeout

- `git push -u origin codex/clipdeck-library-filter`
- `gh pr create --title "clipdeck: sticky filter input" --body "<reference to spec-library-filter.md and a brief summary>"`
- `gh pr merge <num> --merge --auto --delete-branch`
- merge completes the work — no follow-up commits required
