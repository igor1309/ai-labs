---
date: 2026-04-06
model: opus-4.6
description: "Product-level UX decisions for Nexum v1 web UI"
version: 1.0.0
status: accepted
type: spec
references:
  - ADR/nexum-frontend-adr-v0_2_0.md
  - ADR/nexum-openapi-v1.yml
---

# Nexum UX Spec v1

Product-level UX decisions for the Nexum web UI. These are product rules, not architecture — the frontend ADR owns the architecture; this spec owns the user-facing behavior.

## Table

### Columns

| Column | Source | Sortable |
|---|---|---|
| Name | GitHub metadata (`name`); renders as a link to the repository | yes |
| Stars | GitHub metadata (`stars`) | yes |
| Description | GitHub metadata (`description`) | yes |
| Note | App database (`note`) | yes |
| Added | App database (`addedAt`) | yes |

### Sort

- Single active sort column at a time.
- Tapping an inactive column header activates it with ascending order.
- Tapping the active column header toggles between ascending and descending.
- Default sort: Added, descending (newest first).

### Search

- Single free-text input.
- Client-side filter over the snapshot array.
- Case-insensitive substring match across: Name, Description, Note.
- Current sort order is preserved while filtering.
- Empty query shows all entries.

## Inline Editing

- Note is the only inline-editable field.
- Activation: click/tap the note cell.
- Explicit save and cancel controls (no auto-save on blur).
- Saving dispatches `PATCH /repos/{id}/note`.

## Add Flow

- Input: repo URL + note.
- Both fields are required, with one exception: an empty note is allowed only with explicit user confirmation ("Save without note?" or equivalent).
- Save is explicit (not automatic on paste).

## Duplicate Handling

- `POST /repos` returns `409` with `{ existingId }` on duplicate.
- The UI highlights the existing entry using `existingId` (scroll into view, visual emphasis).
- No second entry is created.

## Empty States

- No entries: show a prompt to add the first repo.
- Search with no results: show "No matches" with the current query echoed.

## No Detail Page

There is no separate detail page in v1. The table is the only view. Repo name is a link that opens the repository itself (external navigation).
