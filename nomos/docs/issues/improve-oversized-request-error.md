---
date: 2026-04-27
model: gpt-5
description: "Ticket to improve Nomos oversized JSON request error reporting"
---

# Improve Oversized Request Error

## Problem

Nomos currently relies on the default Express JSON body parser behavior when a request body is too large. After the scope-creep revert, Nomos does not configure `express.json()` with an explicit `limit`, so the effective default must be verified from the installed Express/body-parser implementation during this ticket.

Callers currently see a generic HTTP 413 response such as `request entity too large`. That message does not make it explicit that Nomos rejected the request before forwarding it to any model provider, and it does not report the effective JSON body limit.

## Requirements

- Add a failing test first for an oversized JSON request.
- Return a structured Nomos error response for JSON payloads that exceed the effective parser limit.
- Include the HTTP status, a stable machine-readable error code, and the effective JSON body limit in the response.
- Make the response clear that Nomos rejected the request locally.
- Keep behavior for unrelated malformed JSON errors covered by existing tests.
- Update the relevant Nomos docs/log when implemented.

## Acceptance Criteria

- An oversized JSON request returns HTTP 413 with a Nomos-owned error body.
- The response identifies the effective JSON body limit.
- The implementation proves the default limit from source/config instead of relying on assumption.
- Existing Nomos tests pass.
