---
date: 2025-03-22
model: claude-opus-4-6
description: "LLM client spec: OpenRouter-backed stateless chat client with own domain types"
---

# LLM Client

## Goal

Stateless client that sends conversation messages to OpenRouter's chat completions API and returns a response. No dependency on `AgentLoop`.

## Requirements

1. Owns its own domain types.
2. Supports conversation roles: system, user, assistant (text and tool calls), tool results.
3. Sends authenticated requests to OpenRouter chat completions endpoint.
4. Maps API response to own `Response` type (text or tool call).
5. Throws on non-2xx status or malformed response.
6. Transport is injectable — no direct URLSession dependency.
7. Factory is a class; config and transport are factory-level dependencies.
8. Composition layer maps between `AgentLoop` and `LLMClient` types.

## Tests

1. Request URL matches configured base URL + path.
2. Request includes auth header.
3. Each message role maps correctly to the request body.
4. Text response maps to `.text`.
5. Tool call response maps to `.toolCall`.
6. Non-2xx status throws.
7. Malformed response throws.

## Done criteria

- All tests pass.
- No dependency on `AgentLoop` types.
- No dependency on URLSession in tests.
