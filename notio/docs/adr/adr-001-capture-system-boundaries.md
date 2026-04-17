---
title: ADR-001 Capture System Boundaries
date: 2026-04-17
version: 0.0.1
status: accepted
model: GPT-5.4 Thinking
category: adr
---

# ADR-001: Capture System Boundaries

## Status
Accepted.

## Executive Summary
The capture system is split into four layers: ingress adapter, capture service, storage interface, and storage implementation. Telegram is the first ingress; GitHub and Supabase are storage implementations. The capture service MUST NOT be coupled to transport or storage specifics. Read, edit, and reader-client flows are explicitly out of scope.

## Context
The system starts with Telegram as the first ingress and a GitHub-backed inbox repository as the first concrete persistence target.

The initial use cases are:
- note only
- link only
- link with note

The design must not couple the capture core to Telegram message semantics beyond the minimum needed for parsing, and must not couple the service to GitHub-specific storage details.

Future expansion is expected:
- more source types
- richer enrichment
- tags
- other storage implementations
- possible reader/editor clients decoupled from capture

### Rejected alternatives
- **Capture service owns GitHub concerns**: rejected because it couples the domain to one storage representation.
- **Markdown as the canonical artifact**: rejected because markdown is only one possible representation.
- **Storage identity as part of the canonical item**: rejected because identity belongs to storage implementation, not capture semantics.

## Decision
The system is split conceptually into the following parts:

1. **Ingress adapter**
   - Telegram is an ingress.
   - It receives messages and forwards content into the capture flow.
   - It does not own enrichment, canonical modeling, markdown rendering, or storage-specific behavior.

2. **Capture service**
   - Owns parsing, normalization, and enrichment orchestration.
   - Accepts a message that may contain a primary URL, note text, or both.
   - Produces a canonical captured item.
   - Persists that canonical item through a storage interface.

3. **Storage interface**
   - Storage is an async dependency of the capture service.
   - The service submits a canonical item and receives success or failure only.
   - The capture service does not perform reads as part of the capture flow.

4. **Storage implementation**
   - Representation is implementation-specific.
   - GitHub-backed storage may render markdown and write files.
   - A Supabase-backed storage may persist rows/documents.
   - Identity, layout, commit semantics, and representation are not part of the capture service contract.

## Ingress message rules
A message may be one of:
- note only
- link only
- link with note

When multiple URLs are present:
- the first URL is the primary source
- remaining URLs are treated as part of the note
- those secondary URLs are not first-class sources in v1

No explicit capture commands are required in v1.
Every normal message is treated as capture content.

Telegram-specific entities/formatting are parsed minimally:
- enough to correctly identify the intended primary link
- enough to preserve obvious explicit links where useful
- not as first-class domain concepts

## Canonical item rules
The capture service produces a storage-independent canonical item.

The item supports at least:
- `kind: link | note`
- `source_type` for link items, such as `github_repo` or `web_page`
- capture timestamp in UTC
- canonical URL if present
- normalized note if present
- explicit enrichment status
- common captured fields at top level
- source-specific captured fields nested under a source-specific block

The item MUST NOT include:
- storage identity
- markdown representation
- GitHub commit data
- repo path/layout data
- Telegram transport-specific metadata unless explicitly needed by the domain later

## URL handling
Primary URL handling:
- only canonical URL is stored
- transport junk such as `utm_*` MUST be removed
- semantically meaningful query components should be preserved

Secondary URLs inside note text:
- remain part of the note
- may be normalized and preserved inline by storage-specific representation logic
- are not modeled as structured secondary source objects in v1

## Enrichment
Enrichment is best-effort.

Rules:
- GitHub repository root links receive repository-oriented enrichment
- non-root GitHub links fall back to generic web handling
- generic web links may capture title and short description if trivially available
- if enrichment fails, persistence MUST still proceed
- enrichment outcome must be recorded explicitly

## Persistence semantics
For the capture flow:
- success means the item was persisted
- failure means the item was not persisted
- no read-back is required by the capture service

v1 persistence is append-only from the capture service point of view.
No deduplication or update behavior is required.

## Consequences
### Positive
- clean separation between ingress, capture core, and storage implementation
- GitHub-backed storage and Supabase-backed storage both fit cleanly
- storage representation can evolve independently
- later reader/editor flows remain decoupled from capture
- markdown is treated correctly as representation, not domain

### Negative
- some implementation details remain deferred to adapters
- projection differences across storage implementations may need separate tests
- minimal Telegram parsing still needs careful edge-case handling

## Non-Goals
- Read, search, filter, or editor flows for captured items.
- Tag modeling or item categorization beyond the capture act.
- Deduplication or update semantics in v1.
- Markdown as a domain artifact.
- Structured modeling of secondary URLs in v1.
