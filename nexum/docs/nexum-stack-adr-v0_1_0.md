---
title: "ADR: Nexum Technology Stack"
date: 2026-04-05
model: opus-4.6
version: 0.1.0
status: accepted
type: adr
amends:
  - nexum-backend-adr-v0_3_0.md
  - nexum-frontend-adr-v0_2_0.md
---

# ADR: Nexum Technology Stack

## Decision

The entire Nexum stack is Swift.

### Backend

Server-side Swift. The backend ADR's architecture (protocols, use cases, composition root) maps directly to a Swift package. Hummingbird 2 as the HTTP framework — structured concurrency native, lightweight, composition-friendly.

This supersedes the Supabase Edge Function deployment model from the backend ADR. Hosting is self-managed.

### Frontend Core

Swift package. State machines, reducers, effect handler, services — all Swift. Tested independently against the ADR contracts.

### CLI

Swift. Depends on the frontend core package. Mirrors the web UI's full command set: add, list, edit note, search.

### Web UI

Swift compiled to WebAssembly via the mainline Swift toolchain (6.1+). The frontend core runs in the browser. UI rendering layer on top — framework TBD (ElementaryUI, JavaScriptKit + thin JS, or similar).

This path requires the reactive layer to use Observation, not Combine. Combine is not available on the WASM target.

## What This Changes

- **Backend deployment**: Supabase Edge Function → self-hosted server-side Swift. DB and auth provider choices remain open (Supabase services can still be consumed as external dependencies).
- **Frontend reactive layer**: Combine (previously considered reactive layer pattern) → Observation. This is a prerequisite for WASM compilation. No existing production code uses Combine; this records a design pattern choice, not a migration.

## What This Does Not Change

- All architectural decisions from the backend ADR, frontend ADR, auth ADRs, and review amendments remain in effect.
- The OpenAPI contract is unchanged.
- Protocol-based architecture, dependency inversion, and composition root wiring are unchanged — they are now implemented in Swift rather than described in prose.