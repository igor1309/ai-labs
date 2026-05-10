# Nexum

A private single-user repo memory system. Save GitHub repos with personal notes, search and sort the collection, and keep metadata current — all in a single-table interface.

## Stack

Full Swift: server-side Swift (Hummingbird 2) for backend, Swift package for frontend core, Swift CLI, and Swift-to-Wasm (JavaScriptKit) for web UI.

## Architecture

Architecture Decision Records and the API contract live in `docs/ADR/`. Product-level UX decisions live in `docs/nexum-ux-spec-v1.md`.

## Status

Pre-implementation. ADRs and API contract are locked; implementation planning next.

## Description

Save GitHub repos with personal notes, search and sort the collection, keep metadata current. *Full Swift stack* — Hummingbird backend, Swift-to-Wasm web UI via JavaScriptKit.

## Stack

- Swift 6.1
- Hummingbird 2
- JavaScriptKit
- Wasm
