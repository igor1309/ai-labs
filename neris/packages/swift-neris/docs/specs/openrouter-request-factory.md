---
date: 2026-03-22
model: claude-opus-4-6
description: "OpenRouterRequestFactory spec: builds URLRequests for OpenRouter chat completions API"
---

# OpenRouterRequestFactory

## Goal

Class that builds `URLRequest`s for the OpenRouter chat completions API. Owns its own `Message` type. Knows nothing about `AgentLoop` or any other domain types.

## Public interface

- `init(config: @escaping () throws -> Config)`
- `func make(_ messages: [Message]) throws -> URLRequest`
- `struct Config` — API key, model, URL
- `enum Message` — cases matching OpenRouter's role set

## Behavior

- Reads config via the injected closure on each call. Config read failure propagates.
- Serializes messages to OpenRouter JSON format.
- Sets URL, HTTP method, headers (auth, content type), and body.

## Done criteria

- All tests pass.
- No dependency on `AgentLoop` or any other domain type.
