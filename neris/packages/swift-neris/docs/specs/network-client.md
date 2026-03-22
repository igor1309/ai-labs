---
date: 2025-03-22
model: claude-opus-4-6
description: "NetworkClient spec: generic 3-dep request-transport-parse pipeline"
---

# NetworkClient

## Goal

Generic class `NetworkClient<Input, Output>` that orchestrates a request-transport-parse pipeline. Reusable for any remote API.

## Architecture

3 injectable closure dependencies:

1. **Request factory** — maps `Input` to a request suitable for transport. Can fail.
2. **Transport** — sends the request and returns raw response. Can fail.
3. **Response parser** — maps raw response to `Output`. Can fail.

`send` orchestrates: input → request factory → transport → response parser → `Output`.

## Requirements

1. Generic over `Input` and `Output`.
2. All 3 dependencies are injectable closures.
3. Errors from any stage propagate to the caller.

## Tests

1. Input passes through to request factory.
2. Request factory result passes through to transport.
3. Transport result passes through to response parser.
4. Response parser result is returned from `send`.
5. Request factory error propagates.
6. Transport error propagates.
7. Response parser error propagates.

## Done criteria

- All tests pass.
- No concrete dependency on URLSession or any provider in tests.
