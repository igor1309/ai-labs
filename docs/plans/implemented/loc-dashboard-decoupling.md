---
date: 2026-05-10
model: claude-opus-4-7
description: "Implementation plan: decouple Products from loc-dashboard.html into products.html, refresh stale LOC data, add last-updated timestamp, tighten product card density"
---

# Implementation Plan: loc-dashboard.html decoupling + cleanup

## Source

Validated feedback from design research at
`.lazyweb/design-research/loc-dashboard-2026-05-10/report.md`.

Accepted recommendations:

1. **Decouple Products and Codebase.** Extract the Products section into a new
   `docs/products.html`. `loc-dashboard.html` becomes LOC-only and links to
   `products.html`.
2. **Refresh stale LOC data.** Several rows show 0 LOC because the data array
   in `loc-dashboard.html` was not updated after recent merges. Re-run
   `scripts/loc-dashboard.sh` and replace the data array.
3. **Add `LAST UPDATED` timestamp** to `loc-dashboard.html`. Currently the
   footer only references the script name with no date — readers can't tell
   how fresh the numbers are.
4. **Tighten product card density** with subtle category grouping (the
   existing `product-type` spans already provide the categories — group rows
   by them).

Rejected recommendations (do not implement):

- Replacing stacked bars with grouped bars — would triple chart height for 20
  projects with no clarity gain.
- Hiding "zero-LOC rows" — those are data-staleness, not real zeros (root
  cause is fixed by recommendation 2).
- Promoting Test/Code ratio as the hero metric — wrong premise.

## Execution metadata (per CLAUDE.md)

- **Execution mode:** auto-continue between steps; **human-review-gated** at
  the pre-push step only.
- **Worktree:** all work happens in `worktrees/loc-dashboard/` on branch
  `codex/loc-dashboard` (already cut from `trunk`). Do **not** create a new
  branch — the worktree already exists.
- **Push policy:** push only after explicit human approval of the rendered
  HTML pages. Then `gh pr create` followed by
  `gh pr merge <num> --merge --auto --delete-branch` per CLAUDE.md.
- **Final archive:** move this file to `docs/plans/implemented/` as the
  closeout step after merge.
- **Verification:** docs-only change set; no test/build gates required.
  Per-step verification is grep-based + visual.
- **Log entry:** `docs/log.md` (repo-level — both touched files live under
  `docs/`).

## Preconditions

- Working directory is `worktrees/loc-dashboard/`.
- `git rev-parse --abbrev-ref HEAD` reports `codex/loc-dashboard`.
- `docs/loc-dashboard.html` exists at HEAD (inherited from trunk).
- `scripts/loc-dashboard.sh` is executable and runs cleanly from worktree
  root.
- No characterization test harness needed: this is static HTML with no test
  coverage and no automated rendering tests in the repo. Verification is
  visual + grep-based.

## Steps

```yaml
plan:
  source_finding_title: "Decouple Products and Codebase sections in loc-dashboard.html"
  goal: "Split loc-dashboard.html into products.html (portfolio) and loc-dashboard.html (LOC-only), refresh stale data, add timestamp, group products by category"

  preconditions:
    - "cwd is worktrees/loc-dashboard, branch codex/loc-dashboard"
    - "scripts/loc-dashboard.sh runs without error"

  steps:

    - step_id: 1
      description: "Refresh LOC data — run scripts/loc-dashboard.sh from the worktree root and replace the data array in docs/loc-dashboard.html with the fresh per-project numbers. Also update the four summary cards (Code/Tests/Docs/Total) and the table footer TOTAL to match the new totals. Update the Test/Code ratio badge."
      operation:
        type: "UPDATE_CALL_SITE"
        target: "docs/loc-dashboard.html"
        details:
          regions:
            - "const data = [...] block in inline <script>"
            - ".cards .card .value (Code/Tests/Docs/Total)"
            - "tfoot tr td (TOTAL row)"
            - ".ratio-badge text"
          source_command: "./scripts/loc-dashboard.sh --sort=name"
      verification:
        - type: "SYMBOL_EXISTS"
          target: "docs/loc-dashboard.html"
          notes: "Per-project totals in chart + table match script output; summary cards sum equals TOTAL row; no project shows 0/0/0 unless the source tree genuinely has no files"

    - step_id: 2
      description: "Add LAST UPDATED line to docs/loc-dashboard.html footer. Format: 'Last updated: YYYY-MM-DD'. Use today's date in ISO form."
      depends_on: [1]
      operation:
        type: "ADD_PARAMETER"
        target: "docs/loc-dashboard.html footer"
        details:
          insert_line: "Last updated: 2026-05-10 · loc-dashboard.sh"
          replaces: "ai-labs · loc-dashboard.sh"
      verification:
        - type: "SYMBOL_EXISTS"
          target: "string 'Last updated:' in docs/loc-dashboard.html"
          notes: "grep -c 'Last updated:' docs/loc-dashboard.html returns 1"

    - step_id: 3
      description: "Create docs/products.html. Copy the full <style> block, the <header>, the <section class='products'> block, the reveal/mouse-glow scripts, and the page boilerplate from docs/loc-dashboard.html. Update <title> to 'AI Labs — Products'. Add a small below-header link 'View codebase stats →' pointing to ./loc-dashboard.html. Do NOT yet add category grouping — that is step 5."
      operation:
        type: "CREATE_FILE"
        target: "docs/products.html"
        details:
          source_sections:
            - "<style> (full block, unchanged)"
            - "<header><h1>AI Labs</h1>...</header>"
            - "<section class='products'>...</section>"
            - "Scripts: scroll reveal observer + mouse-glow listener (the first <script> block)"
          new_content:
            - "<title>AI Labs — Products</title>"
            - "<a href='./loc-dashboard.html' class='cross-link'>View codebase stats →</a> below the header"
      verification:
        - type: "SYMBOL_EXISTS"
          target: "docs/products.html"
          notes: "File exists; renders 19 product cards; cross-link visible and points to ./loc-dashboard.html"

    - step_id: 4
      description: "Trim docs/loc-dashboard.html: remove the entire <section class='products'> block and the .product/.product-grid/.product-header/.product-name/.product-type/.product-desc/.product-stack/.tag CSS rules and the reveal-related delay rules and mouse-glow JS. Keep the .reveal/.reveal.visible CSS only if other elements still use it (audit; otherwise remove). Add a small 'View products →' link below the header pointing to ./products.html."
      depends_on: [3]
      operation:
        type: "DELETE_OLD_CODE"
        target: "docs/loc-dashboard.html"
        details:
          remove:
            - "<section class='products'>...</section>"
            - "Product-only CSS classes (.product, .product-header, .product-name, .product-type, .product-desc, .product-stack, .tag)"
            - "Mouse-glow JS block (the second-to-last <script>)"
            - ".reveal CSS rules IF no remaining element has class='reveal' (verify with grep)"
          add:
            - "<a href='./products.html' class='cross-link'>View products →</a> below the header"
      verification:
        - type: "SYMBOL_REMOVED"
          target: "<section class='products'> in docs/loc-dashboard.html"
          notes: "grep -c \"class='products'\" docs/loc-dashboard.html returns 0; page still renders the LOC view correctly"
        - type: "SYMBOL_EXISTS"
          target: "View products link"
          notes: "grep './products.html' docs/loc-dashboard.html returns the cross-link"

    - step_id: 5
      description: "Tighten product card density via category grouping in docs/products.html. Bucket the existing 19 cards by their product-type values into 5-7 groups. Add a small section header (h3, muted color, like .section-title) above each group. Keep card markup and styling identical."
      depends_on: [3]
      operation:
        type: "MOVE_CODE"
        target: "docs/products.html — Products section restructure"
        details:
          grouping:
            - "CLI & Tooling: Regentara, Session Digest, Tools"
            - "Web Apps: Clipdeck, Nexum, Oracle — Am I Done?"
            - "MCP Servers: Corpus Scout, Web Scout"
            - "Services: Nomos, Notio"
            - "Frameworks & Concepts: Neris, Niora"
            - "Observability & Automation: Loki, Claude Insights"
            - "Editorial & Agents: Doc Drift Agent, The Dragoman, Dev Skills"
            - "Research: Sandbox"
          notes: "Groups are draft — adjust if a list of 7-8 fits better; do not change card content"
      verification:
        - type: "SYMBOL_EXISTS"
          target: "category headers in docs/products.html"
          notes: "Each group header is visually distinct from card titles; all 19 original cards present (count product-name spans = 19); no card duplicated or dropped"

    - step_id: 6
      description: "Update docs/log.md with a single-entry summary of this change set. Reverse-chronological order (newest first). Concise; do not mirror commit messages."
      depends_on: [1, 2, 4, 5]
      operation:
        type: "ADD_PARAMETER"
        target: "docs/log.md"
        details:
          new_entry: "2026-05-10 — split docs/loc-dashboard.html into loc-only and docs/products.html, refreshed stale LOC data array, added last-updated timestamp, grouped products by category"
      verification:
        - type: "SYMBOL_EXISTS"
          target: "log entry dated 2026-05-10 in docs/log.md"

    - step_id: 7
      description: "Local visual smoke check: open docs/loc-dashboard.html and docs/products.html in the agent's environment as a sanity step (not the human review). Confirm both render without console errors, hover effects work, cross-links navigate."
      depends_on: [6]
      operation:
        type: "UPDATE_CALL_SITE"
        target: "open docs/loc-dashboard.html docs/products.html"
        details:
          checks:
            - "loc-dashboard.html: KPI cards, ratio badge, legend, bar chart with all rows, table, last-updated line"
            - "products.html: header, cross-link, category sections, 19 cards total, hover gradient working"
            - "Cross-links navigate in both directions"
      verification:
        - type: "BUILDS"
          target: "browser render"
          notes: "Both pages render without layout breaks; no missing assets; cross-links work"

    - step_id: 8
      description: "Commit changes in two logical commits in the worktree: (a) data refresh + timestamp on loc-dashboard.html, (b) products.html extraction + grouping + cross-links + log. Use lowercase imperative messages per CLAUDE.md."
      depends_on: [7]
      operation:
        type: "UPDATE_COMPOSITION_ROOT"
        target: "git (worktrees/loc-dashboard)"
        details:
          commits:
            - "refresh loc-dashboard data and add last-updated timestamp"
            - "extract products.html from loc-dashboard, group by category, link both ways"
      verification:
        - type: "ALL_TESTS_PASS"
          notes: "N/A — docs-only. Confirm git status is clean and the new commits are ahead of trunk."

    - step_id: 9
      description: "HUMAN-REVIEW-GATE — open docs/loc-dashboard.html and docs/products.html in the user's browser. STOP and wait for explicit user approval (verbal/typed 'looks good' or equivalent). Do not push until the user has visually inspected both pages and confirmed. If the user requests changes, return to the relevant step and re-iterate before reaching this gate again."
      depends_on: [8]
      operation:
        type: "UPDATE_CALL_SITE"
        target: "human review of rendered HTML"
        details:
          checks_for_user:
            - "loc-dashboard.html — fresh data, last-updated stamp, link to products"
            - "products.html — category groupings, hover effects, link back"
            - "no visual regressions vs. the original combined page"
          stopping_condition: "Wait for explicit user approval. Do not proceed without it."
      verification:
        - type: "SYMBOL_EXISTS"
          target: "user approval"
          notes: "User has explicitly stated approval to push. No automated proxy."

    - step_id: 10
      description: "Push branch from the worktree, open PR, enable auto-merge."
      depends_on: [9]
      operation:
        type: "UPDATE_COMPOSITION_ROOT"
        target: "github"
        details:
          commands:
            - "git -C worktrees/loc-dashboard push -u origin codex/loc-dashboard"
            - "gh pr create --title 'split loc-dashboard into loc + products' --body ..."
            - "gh pr merge <num> --merge --auto --delete-branch"
      verification:
        - type: "SYMBOL_EXISTS"
          target: "PR open with auto-merge enabled"

    - step_id: 11
      description: "After merge: pull trunk, move this plan file from docs/plans/ to docs/plans/implemented/ as final closeout. Worktree may be removed once merged."
      depends_on: [10]
      operation:
        type: "MOVE_CODE"
        target: "docs/plans/loc-dashboard-decoupling.md → docs/plans/implemented/"
      verification:
        - type: "SYMBOL_REMOVED"
          target: "docs/plans/loc-dashboard-decoupling.md (top-level)"
        - type: "SYMBOL_EXISTS"
          target: "docs/plans/implemented/loc-dashboard-decoupling.md"
```

## Open question

The data-refresh step is manual today (script prints, human pastes into HTML).
Worth a follow-up: have `scripts/loc-dashboard.sh` emit a `--json` mode that
either prints a JSON blob or writes `docs/loc-dashboard.data.json` so the page
fetches its data, eliminating drift entirely. **Out of scope for this plan**
— call out as a follow-up issue after merge.
