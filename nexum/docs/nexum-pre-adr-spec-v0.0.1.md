---
title: Nexum — Pre-ADR Spec
date: 2026-04-05
model: GPT-5.4 Thinking
version: 0.0.1
status: draft
type: pre-adr-spec
---

# Nexum

## 1. Purpose

A private personal repo memory system.

The product solves a recall and re-finding problem: repos are encountered across sources such as Telegram notes, saved inconsistently, then become hard to recover later together with the reason they mattered.

The intended value in v1 is:

- personal curated repo memory
- lightweight private knowledge base of saved repos

This is not a generic public repo discovery product.

## 2. Audience

Single-user only.

v1 is a private app for one person.

## 3. Canonical entry model

One repo equals one canonical entry.

The system does not allow duplicate repo entries as separate records.
If the same repo is added again, the duplicate is rejected and the existing entry is opened.

## 4. Authoritative data model

There are two authoritative sources of truth.

### 4.1 App database

Authoritative for:

- `repoUrl`
- `note`
- `addedAt`

### 4.2 GitHub

Authoritative for repo metadata.

Examples discussed:

- repo name
- description
- stars

## 5. Snapshot / cache model

The app uses a page-level snapshot as a read model.

The snapshot is:

- not a domain source of truth
- a materialized read model for page rendering and search

The page works against the snapshot for UX reasons.

The snapshot is the effective source for:

- table rendering
- sorting
- search

The snapshot is updated by refresh.

## 6. Refresh triggers

Refresh is triggered by:

- repo add
- manual refresh
- page open

Page-open refresh is not a separate architectural mode. It is the same refresh mechanism triggered on page open.

## 7. Refresh behavior in UI

When the page opens:

- show the current snapshot immediately
- show a loading indicator for refresh
- update the table if refresh succeeds
- replace the loader with success or error message when refresh completes

If refresh partially succeeds:

- successful repo metadata is updated
- failed repo metadata keeps the previous snapshot state
- snapshot carries update result/status information

## 8. Add flow

Mandatory input at add time:

- repo URL
- note

Short note structure is intentionally left unstructured.
Structuring the note is considered premature.

Empty note is allowed only with explicit confirmation.

After repo URL paste:

- metadata is fetched automatically from GitHub
- add form opens with note as the primary user input
- save remains explicit/manual

## 9. Write model in v1

The write surface in v1 supports:

- add new entry
- inline edit in table

There is no separate detail page in v1.

Repo name is a link and opens the repository itself.

There is only one current multiline note per repo in v1.
There is no note history trail in v1.

## 10. Table model

The table is a real horizontal table.

Selected columns:

- Name
- Stars
- Description
- Note
- Added date

On smaller widths / mobile:

- keep the selected columns
- allow horizontal scrolling

Sorting behavior:

- single active sort only
- tapping an already active header toggles ascending / descending

## 11. Search

v1 includes search.

Chosen direction:

- single free-text search
- over snapshot + note

Search is part of the primary retrieval model together with browsing/sorting.

## 12. Access model

v1 is private.

Read and write both require authentication.

Authentication choice for v1:

- Supabase Auth

## 13. Runtime boundary

Runtime boundary for v1:

- separate runtimes

This is independent of repo/codebase layout.
A monorepo with separate packages/apps remains fully compatible with this decision.

## 14. What is already decided enough to guide implementation

The following points are settled for pre-ADR purposes:

- private single-user v1
- one canonical repo entry
- no duplicate entries
- mandatory add input is repo URL + note
- empty note requires explicit confirmation
- note remains a single multiline freeform field
- GitHub metadata is fetched automatically from repo URL
- no detail page in v1
- repo name opens the repository
- inline editing exists in table
- table columns are Name, Stars, Description, Note, Added date
- true horizontal table with horizontal scrolling on small widths
- single-column sorting
- active column toggles ascending/descending on repeat tap
- search exists and spans snapshot + note
- DB is authoritative for `repoUrl`, `note`, `addedAt`
- GitHub is authoritative for repo metadata
- snapshot is a read model for rendering and search
- refresh triggers are repo add, manual refresh, page open
- current snapshot stays visible during refresh
- separate runtimes in v1
- Supabase Auth is used for auth

## 15. Explicit open questions

### 15.1 Snapshot status/result shape

Known:

- snapshot has an update result/status field
- loader is shown during refresh
- success/error message is shown after refresh

Still open:

- exact state model
- whether status includes timestamps
- how partial success is encoded
- whether error details are stored and at what level

### 15.2 Exact snapshot structure

Known:

- snapshot is page-level
- snapshot is used for render and search

Still open:

- exact internal shape
- normalized vs denormalized representation inside snapshot
- whether snapshot carries a version/schema marker

### 15.3 Search semantics

Known:

- one free-text search over snapshot + note

Still open:

- exact matching model
- ranking/order behavior
- DB-native full-text vs simpler matching approach

### 15.4 Inline edit behavior

Known:

- inline edit exists in table

Still open:

- exact interaction design
- save semantics
- whether editing is immediate, explicit-save, or blur-based

### 15.5 Runtime/deployment specifics

Known:

- separate runtimes

Still open:

- which platform hosts UI
- which platform hosts backend
- deployment topology details

### 15.6 GitHub Actions role

Initially listed in the idea, but not part of the resolved core architecture.

Still open:

- whether GitHub Actions are used in v1 at all
- whether they are deferred to later automation/maintenance workflows only

### 15.7 Schema shape

Conceptual data ownership is clear.

Still open:

- exact DB tables/collections
- uniqueness key beyond practical repo URL handling
- whether snapshot is stored purely as one blob, projected tables, or both

## 16. Pre-ADR direction in one sentence

A private single-user repo memory app with canonical repo entries, DB-owned personal context, GitHub-owned metadata, and a page-level snapshot read model that powers table rendering and search and is refreshed on repo add, manual refresh, and page open.
