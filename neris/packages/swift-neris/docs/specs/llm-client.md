---
date: 2025-03-22
model: claude-opus-4-6
description: "LLM client spec: stateless chat client with own domain types"
---

# LLM Client

## Goal

Stateless client that sends conversation messages to a transport and returns a response. No dependency on `AgentLoop`.

## Requirements

1. Owns its own domain types.
2. Supports conversation roles: system, user, assistant (text and tool calls), tool results.
3. Transport is injectable — no direct URLSession dependency.
4. Factory is a class; transport is a factory-level dependency.
5. Maps transport response to own `Response` type (text or tool call).
6. Throws on non-2xx status or malformed response.

## Caller (composition layer) responsibilities

- Provides the full endpoint URL (including `/chat/completions` path).
- Provides authenticated transport (with `Authorization` header).
- Maps between `AgentLoop` and `LLMClient` types.

## Tests

1. Messages pass through to transport.
2. Text response maps to `.text`.
3. Tool call response maps to `.toolCall`.
4. Non-2xx status throws.
5. Malformed response throws.

## Done criteria

- All tests pass.
- No dependency on `AgentLoop` types.
- No dependency on URLSession in tests.
