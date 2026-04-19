---
date: 2026-04-19
model: claude-opus-4-6
description: "Implementation plan for enrichment pipeline: fetch title/description for captured links"
status: active
type: plan
---

# Enrichment Pipeline — Implementation Plan

**Spec**: `notio/docs/specs/enrichment-v0.0.1.md`

## Execution lock

- Worktree required: yes
- Expected worktree: `worktrees/notio-enrichment`
- Expected branch: `feat/notio-enrichment`
- Preflight check: [x] done

## Per-step closeout (applies to every step)

After each step's specific gates pass:

1. Self-review the step against spec and plan scope.
2. Fix any issues found.
3. Run `swift test --package-path notio` — must pass.
4. Commit only files related to the current step.
5. Mark step checklist items with verified evidence.
6. Push the branch.
7. Stop and wait for review approval before starting the next step.

## Steps

### Step 1 — Add `capturedTitle` and `capturedDescription` to `CapturedItem`

Add two optional `String?` fields to `CapturedItem`. Update the `init(from:)` initializer to set them to `nil`. Update `SupabaseRow` to include the new fields. Update existing tests that construct `CapturedItem` if needed.

- [x] Fields added to `CapturedItem`
- [x] `SupabaseRow` maps the new fields
- [x] `swift test` passes
- [x] Per-step closeout complete

### Step 2 — Add `EnrichmentResult` and `Enricher` protocol

Create `EnrichmentResult` struct and `Enricher` protocol per spec. Add a method on `CapturedItem` to apply an `EnrichmentResult` (returns a new item with title, description, and enrichment status set). Protocol lives in the same module as the capture service (protocol-owned-by-client rule).

- [x] `EnrichmentResult` struct
- [x] `Enricher` protocol
- [x] `CapturedItem.applying(_:)` method
- [x] Tests: applying full/partial/failed results maps correctly (spec test #10)
- [x] `swift test` passes
- [x] Per-step closeout complete

### Step 3 — HTML metadata extractor

Create a pure function that extracts `<title>` and `<meta name="description">` from HTML string/data. No HTTP — just parsing. This is the unit-testable core of web enrichment.

- [x] `HTMLMetadataExtractor.extract(from:)` → `(title: String?, description: String?)`
- [x] Tests: title extraction, description extraction, both present, neither present, malformed HTML (spec tests #8, #9)
- [x] `swift test` passes
- [x] Per-step closeout complete

### Step 4 — Web page enricher implementation

Implement `WebPageEnricher: Enricher` using `AsyncHTTPClient`. Fetches URL, passes body to HTML extractor, maps to `EnrichmentResult`. Handles timeout (5s), max body (512 KB), non-2xx, and parse errors.

- [x] `WebPageEnricher` struct
- [x] Tests with spy/stub HTTP client or protocol: successful fetch, partial result, failed fetch, timeout, oversized response (spec tests #2, #3, #4, #12, #13)
- [x] `swift test` passes
- [x] Per-step closeout complete

### Step 5 — GitHub repo enricher implementation

Implement GitHub API enrichment for `sourceType == .githubRepo`. Parses owner/repo from URL, calls `GET /repos/{owner}/{repo}`, decodes `full_name` and `description`.

- [x] `GitHubRepoEnricher` or routing logic within a composite enricher
- [x] Tests: successful GitHub API response, API failure (spec tests #5, #6)
- [x] `swift test` passes
- [x] Per-step closeout complete

### Step 6 — Capture service and orchestration

Extract capture orchestration from `WebhookRoute.swift` into a capture service that owns the parse → build item → enrich → save flow. `WebhookRoute` decodes the Telegram update and delegates to the capture service. The enricher is injected into the capture service, not the route.

- [x] `CaptureService` (or equivalent) owns parse → enrich → save
- [x] `WebhookRoute.captureInBackground` delegates to capture service
- [x] Tests at capture-service level: note skip (spec test #1), enrichment failure still saves (spec test #7), link items call enricher with concrete source type (spec test #11)
- [x] `swift test` passes
- [x] `docker build` passes
- [x] Per-step closeout complete

### Step 7 — Supabase schema migration

Add `captured_title` and `captured_description` columns to the `captured_items` table. Commit a migration SQL file at `notio/supabase/migrations/` so the change is repo-tracked and reproducible. Apply via `supabase db query` against the linked project.

- [x] Migration file committed at `notio/supabase/migrations/001_add_enrichment_columns.sql`
- [x] Migration applied to the linked Supabase project
- [x] Verify columns exist with a test query
- [x] Per-step closeout complete

### Step 8 — Final gates and closeout

- [x] Full `swift test` passes
- [x] `docker build` passes
- [x] Log updated (`notio/docs/log.md`)
- [ ] Execution order updated (add enrichment phase)
- [ ] Push and create PR
