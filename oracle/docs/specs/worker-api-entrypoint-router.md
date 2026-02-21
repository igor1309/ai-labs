---
date: 2026-02-21
model: gpt-5.2
description: "Spec: Cloudflare Worker API entrypoint router (health + outlook endpoints)"
---

# Spec: Worker API Entrypoint Router (v1)

## Goal
Expose a stable HTTP surface in the Worker service:
- `GET /health` returns plain `ok`
- `POST /api/outlook` uses the assembled wiring composer handler

The router is `worker-api`-owned. It must keep routing/HTTP details outside core modules.

## Routes
### `GET /health`
Response:
- status `200`
- body `ok` (text/plain)

### `POST /api/outlook`
Delegation:
- Route to the assembled outlook handler (wiring composer output).

Response shape:
- Always JSON body matching the contract in `oracle/docs/am-i-done-architecture.md`.
- For parse failures (invalid JSON): return structured `needsClarification=true` response (handled by wiring composer).

### Default
- Any other path returns `404`.

## Tests (required)
Router tests (can be smoke-level):
- `/health` returns 200 and `ok`.
- unknown route returns 404.
- `/api/outlook` delegates to the outlook handler (spy asserts it was called).

## Done criteria
- Router exists in Worker entrypoint (`fetch`) and delegates to the composed handler.
- Tests cover route selection and delegation.

