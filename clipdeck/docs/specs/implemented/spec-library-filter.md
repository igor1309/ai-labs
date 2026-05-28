---
title: "Spec: Sticky Filter Input for clipdeck Library"
date: 2026-05-10
model: gpt-5.5
description: "DOM contract, behavior rules, and enumerated tests for a sticky case-insensitive substring filter over title, subtitle, and description"
status: draft
artifact_type: spec
---

# Spec: Sticky Filter Input for clipdeck Library

## Goal

Provide a sticky text input above the sections grid that narrows the rendered library to items whose `title`, `subtitle`, or `description` contains the input value as a case-insensitive substring, owned by the clipdeck frontend.

## Public interface

### DOM contract

When items are loaded, the library MUST contain:

- one `<div data-filter-row>` element between the toolbar and the sections grid;
- one `<input data-filter-input>` element of type `text` between the toolbar and the sections grid;
- one `<button data-filter-clear>` element that is rendered (visible) only when the filter input has a non-empty value;
- one `<div data-filter-empty>` element that is rendered only when the active filter matches zero items.

The filter input MUST be inside `[data-filter-row]`, MUST carry a `placeholder` attribute, and MUST NOT carry an `autofocus` attribute.

### Sticky behavior

The filter row (input plus optional clear button) MUST remain visible when the user scrolls the items list. The public CSS contract is that `[data-filter-row]` uses sticky positioning and has a concrete `top` offset.

### Empty-state element

When `[data-filter-empty]` is rendered:

- it MUST contain visible text "No matches";
- it MUST contain one descendant `<button data-filter-empty-clear>` whose label is "Clear filter".

## Behavior rules

### Match function

- A filter term `q` matches an item `i` when any of `i.title`, `i.subtitle`, `i.description` contains `q.trim()` as a case-insensitive substring after both sides are lower-cased with the default Unicode case folding (`String.prototype.toLowerCase`).
- An item with no `subtitle` or no `description` MUST be matched against the present fields only; absent fields contribute no match.
- Empty filter (length zero) and whitespace-only filter (after `.trim()`) MUST be treated as "no filter": every item is rendered.

### Rendering

- When the filter is non-empty and a section's matched item count is zero, that section's heading MUST NOT be rendered.
- When the filter is non-empty and at least one section has a matched item, `[data-filter-empty]` MUST NOT be rendered.
- When the filter is non-empty and no item across any section matches, `[data-filter-empty]` MUST be the only content of `[data-sections]`.

### Input handling

- Filter updates MUST be debounced by 150ms: re-rendering MUST NOT occur on every keystroke, only after the user stops typing for at least 150ms.
- Pressing the `Escape` key while focus is in `[data-filter-input]` MUST clear the input value, restore the full list, and keep focus in the input.
- Clicking `[data-filter-clear]` MUST clear the input value, restore the full list, and return focus to the input.
- Clicking `[data-filter-empty-clear]` MUST clear the input value, restore the full list, and move focus to the input.

### Filter-state visibility

- The filter input MUST NOT be rendered while the skeleton loading state is on screen.
- The filter input MUST NOT be rendered when `GET /api/items` returns zero total items across all sections.
- The filter input MUST be rendered as soon as the items list contains at least one item.
- A Reload action MUST clear the filter value before the new items are rendered. The filter does not persist across reloads.

### State scope

- The filter value lives in the page's runtime state only. It MUST NOT be written to or read from `localStorage`, `sessionStorage`, or the URL.

### No source mutation

- Filtering MUST NOT modify the underlying items map (`state.itemsById`). It is a render-time projection only. Tapping a visible item still copies the original `body` verbatim per the existing copy contract.

## Tests

Each test corresponds to a behavior rule and defines the failure surface. Tests MUST live in `clipdeck/test/frontend.test.ts` (or a sibling file) and MUST run under the existing vitest + jsdom harness.

1. After items load, the document contains exactly one `[data-filter-row]` element positioned in the DOM between `<header class="toolbar">` and `[data-sections]`, and `[data-filter-row]` contains exactly one `[data-filter-input]` element.
2. The `[data-filter-input]` element has a non-empty `placeholder` attribute and no `autofocus` attribute.
3. With an empty filter value, every item returned by the mocked fetch is rendered.
4. Setting the filter value to a substring of one item's `title` and waiting for the debounce produces a rendered list containing only items whose title/subtitle/description contains that substring.
5. The filter is case-insensitive: filter `"REVIEW"` matches an item titled `"Code review"`.
6. The filter matches `subtitle` when neither the title nor the description contains the term.
7. The filter matches `description` when neither the title nor the subtitle contains the term.
8. A whitespace-only filter (e.g., `"   "`) renders every item (treated as empty), and a padded non-empty filter (e.g., `" review "`) matches as its trimmed value (`"review"`).
9. When the filter excludes every item in a section, that section's heading is not present in the DOM.
10. When the filter matches zero items across all sections, `[data-filter-empty]` is rendered, its text contains "No matches", and it contains a `[data-filter-empty-clear]` button labelled "Clear filter".
11. Clicking `[data-filter-empty-clear]` clears the filter input value, re-renders every item, and moves focus to `[data-filter-input]`.
12. Pressing Escape while focus is in `[data-filter-input]` clears the input value and re-renders every item; focus remains in `[data-filter-input]`.
13. The `[data-filter-clear]` button is hidden (not rendered, or has `hidden=true`) when the input is empty, and visible when the input has a non-empty value. Clicking it clears the input, re-renders every item, and moves focus to `[data-filter-input]`.
14. Filter updates are debounced: typing two characters within 100ms leaves the visible item list unchanged before the debounce interval completes, then renders the final query result after 150ms of inactivity.
15. While the skeleton loading state is on screen, `[data-filter-input]` is not rendered.
16. When the API returns `sections: []` (zero total items), `[data-filter-input]` is not rendered.
17. When the API returns at least one item, `[data-filter-input]` is rendered.
18. After clicking `[data-reload]`, the filter input value is reset to empty before the new items are rendered.
19. The filter value is never read from or written to `localStorage` or `sessionStorage` (verified by asserting zero calls to `localStorage.getItem`/`setItem` keyed by the filter).
20. The filter value is never read from or written to the URL (verified by loading with a query/hash containing a filter-like value and by asserting `history.pushState`/`history.replaceState` are not called during filter changes).
21. The stylesheet contains a rule for `[data-filter-row]` with sticky positioning and a concrete `top` offset.
22. Tapping a filtered-in item still writes that item's original `body` to the clipboard verbatim (regression test for the existing copy contract).

## Done criteria

- The DOM contract above is implemented in `clipdeck/src/static/index.html`, `clipdeck/src/static/app.css`, and `clipdeck/src/static/app.js`.
- All tests in the Tests section pass under `./scripts/run_silent.sh "tests" npm test`.
- `./scripts/run_silent.sh "build" npx tsc --noEmit` is green.
- This spec moves to `clipdeck/docs/specs/implemented/` once the above are met.
