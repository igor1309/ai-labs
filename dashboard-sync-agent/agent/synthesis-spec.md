---
date: 2026-05-10
model: claude-opus-4-7
description: "Synthesis spec for dashboard-sync-agent: how the project registry and per-project READMEs map to scripts/loc-dashboard.sh, docs/products.html, and the docs/loc-dashboard.html data array"
---

# Synthesis Spec

For each agent-owned surface, this document pins the rules that map the registry (per `project-registry.md`) and per-project READMEs to the surface's content. Two reviewers regenerating from the same inputs must produce byte-identical output.

## Surface (1) — `scripts/loc-dashboard.sh`

The agent edits three locations in this file. The tracked set used for all three is the canonical sorted registry from `project-registry.md`.

### Location 1: `ROW PROJECTS` header comment

A block comment immediately after the `# Options:` line. Format:

```
# ROW PROJECTS (update the loop in main when adding a new project):
#   <names...>
```

Names are joined with `, ` (comma + space). The list wraps to a maximum line length of **78 characters** (counting from column 1, including the leading `#   `). Each continuation line begins with `#   ` (hash, three spaces). A trailing comma at the end of a non-final line is permitted and preferred (matches the current style). The names appear in canonical sorted order.

### Location 2: `for proj in ...` loop

A single line of the form:

```
for proj in <names joined by single space>; do
```

No line wrapping — Bash `for` accepts a long line. Exact prefix `for proj in ` and suffix `; do`. Names appear in canonical sorted order, joined by exactly one space.

### Location 3: `known` list inside `check_project_drift`

A single line of the form:

```
  local known="<names joined by single space>"
```

Two-space indent. The string is the union of: the canonical tracked set, the excluded-directories list from `project-registry.md`, plus any **untracked candidate** that already appears in the existing `known` list (i.e. the agent does not silently drop a name that the maintainer or a previous run placed there). Names are sorted ASCII-ascending, joined by single spaces. The leading `_inbox` (which sorts after letters under ASCII) appears at the end — this is correct under ASCII sort.

### Surface (1) ordering rule

All three locations use the **same canonical sort** for the tracked set: ASCII-ascending. The `known` list adds non-tracked entries (excluded dirs + carry-overs) and re-sorts the union.

### Surface (1) idempotence

If, after applying the rules above, the file content is byte-identical to the current file, the surface is "no drift" and the agent emits nothing.

## Surface (2) — `docs/products.html`

The agent regenerates the entire product-grid block (every `<h3 class="group-title">` plus its following `<div class="product-grid">…</div>`). Surrounding markup (header, cross-link, `<section class="products">`, `<h2 class="section-title">Products</h2>`, footer) is **not touched** — the agent locates the regenerated region by the markers below and replaces only between them.

### Region markers

- Begin: the line containing `<h2 class="section-title">Products</h2>`. Region begins on the next non-blank line.
- End: the line containing `</section>` that closes `<section class="products">`. Region ends on the previous non-blank line.

If either marker is absent, the surface is in a hard-error state and the agent emits a PR-description error rather than guessing.

### Card content from `## Components`

For each registry entry whose `Component` row is in `## Components`, the agent emits one card. (Entries that come only from `## Structure` do not get a products.html card — `## Structure` is workspace-machinery, not a product registry.) The card content is derived as follows:

| Card field | Source | Rule |
|------------|--------|------|
| `<span class="product-name">` | Components row | The `Component` cell, **title-cased** with hyphens replaced by spaces (e.g. `claude-insights` → `Claude Insights`, `doc-drift-agent` → `Doc Drift Agent`). When the `Description` cell begins with `"<TitleCase>" ...` (in quotes), use that quoted title verbatim instead — this preserves curated names like `"The Dragoman"`. |
| `<span class="product-type">` | Components row | The `Type` cell verbatim. Capitalization is preserved as written. |
| `<p class="product-desc">` | Components row + per-project README | The `Description` cell becomes the lead `<strong>…</strong>` sentence (truncated to the first sentence if the cell contains multiple). If the project's `<key>/README.md` exists and contains a section titled `## Description` or `## Overview` whose first paragraph extends the description, that paragraph is rendered as the body text after the lead. Otherwise the body is the remainder of the Description cell after the first sentence. **No invention.** If neither source supplies body text, the lead alone is the entire `<p>`. |
| `<div class="product-stack">` tags | Per-project README only | If `<key>/README.md` contains a `## Stack`, `## Tech Stack`, or `## Tags` section formatted as a Markdown bulleted list of bare tag names (one per bullet, no other markup), each bullet becomes one `<span class="tag">…</span>`. If no such section exists, the stack block is omitted entirely (no empty `<div>`). The agent does **not** synthesize tags from prose. |
| Deployed URL inline in `<p class="product-desc">` | Per-project README | If the project's README contains a line of the form `Deployed at: <URL>` or a `## Deployment` section whose first sentence states a URL, the agent inlines `Deployed at <code><URL></code>` as the final sentence of the description body. Otherwise, no deployment line is rendered. |

### Category placement

Categories are derived from `Type` via the following authoritative mapping. Types not in the mapping cause the agent to surface the entry in the PR description's "unmapped types" section and place the card under `Research` provisionally.

| Components `Type` | Category header |
|-------------------|-----------------|
| `Web App`, `Product`, `Product family` | `Web Apps` |
| `CLI`, `CLI Utilities`, `CLI release unit`, `Tooling` | `CLI & Tooling` |
| `MCP Server`, `MCP tool` | `MCP Servers` |
| `Service`, `Service (on hold)` | `Services` |
| `Framework`, `Concept` | `Frameworks & Concepts` |
| `Observability`, `Automation` | `Observability & Automation` |
| `Agent definition`, `Agent Definition`, `Editorial channel`, `Editorial Channel` | `Editorial & Agents` |
| `Research` | `Research` |

The category headers appear in the order listed above. A category with zero cards is omitted (no empty `<h3>` block).

The current `Dev Skills` placement (Components `Type: ?`, currently rendered under `Editorial & Agents` with `product-type: Tooling`) will move to `CLI & Tooling` under this mapping. This is intentional drift the agent's first run surfaces; the maintainer reconciles by either accepting the move or changing the Components `Type` to one that maps to `Editorial & Agents`.

### Card whitespace

Each card uses 6-space indentation (matching the surrounding `<div class="product-grid">`). The card structure is:

```
      <div class="product reveal">
        <div class="product-header">
          <span class="product-name">…</span>
          <span class="product-type">…</span>
        </div>
        <p class="product-desc">
          …
        </p>
        <div class="product-stack">
          <span class="tag">…</span>
          …
        </div>
      </div>
```

The `<div class="product-stack">…</div>` block is omitted entirely when the project has no Stack section in its README (per the rule above) — the closing `</div>` for `product` follows directly after the closing `</p>`.

Within categories, cards are sorted ASCII-ascending by registry key (the Components cell), not by display name.

### Surface (2) idempotence

After regeneration, if the new region content is byte-identical to the current region content, the surface is "no drift."

## Surface (3) — `docs/loc-dashboard.html` `data` array

The agent edits exactly the `const data = [ … ];` block.

### Inputs

The agent runs `bash scripts/loc-dashboard.sh --sort=name` (with the loop already updated by surface (1) in the same run) and parses its tabular output. Each row in the output (excluding the `TOTAL` row and excluding the `agents` and `repo-scripts` aggregate rows) contributes one entry.

The aggregate rows `agents` and `repo-scripts` are part of the displayed dataset but are **not** in the registry. They are appended verbatim (the script's output for these rows is treated as the source of truth, not the registry). Sort order: alphabetical alongside the project entries.

### Output format

Each entry is one line of the form:

```
  { name: "<name>",        code: <code>, tests: <tests>, docs: <docs> },
```

Two-space indent inside the array. The `name:` field is followed by spaces padding the value column to a fixed width. The current file uses width-15 padding (`"<name>"` + spaces to make the next field start at column 27); the agent **preserves the current width** by reading the existing array's first non-empty line and matching its column for `code:`. New names longer than the existing maximum cause the agent to widen the padding for all rows in the same run. Number fields are right-aligned to width 4.

### Ordering

The agent uses the **same order as the script's `--sort=name` output** — ASCII-ascending by `name`. The chart's runtime JavaScript sorts by total at render time, so source order does not affect display, but a stable source order keeps diffs minimal.

### Surface (3) idempotence

If the new array is byte-identical to the current array, the surface is "no drift."

## Cross-surface ordering

All three surfaces use the same canonical ASCII sort on registry keys for the tracked set. Differences are only in what's included:

- Surface (1) `for proj` loop and the `## Components` filter of `known`: tracked set only.
- Surface (1) `known` list: tracked set ∪ excluded-dirs ∪ pre-existing carry-overs.
- Surface (2) cards: tracked set filtered to those with a `## Components` row.
- Surface (3) data array: tracked set ∪ aggregate rows (`agents`, `repo-scripts`).

## Failure modes

The agent does not partially apply changes. If any surface fails its rules (missing region markers, malformed registry, script output unparseable), the agent:

- Emits a PR description with the failure flagged for that surface.
- Leaves the surface untouched.
- Continues with the surfaces that succeeded.

A run with at least one failure is not silent — the PR is opened (or updated) with the partial changes plus the failure note, so the maintainer can intervene.
