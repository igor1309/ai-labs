---
date: 2026-03-22
model: claude-opus-4-6
description: "Review findings: OpenRouterRequestFactory gaps vs real OpenRouter API"
---

# OpenRouterRequestFactory — API Alignment Review

## Blockers (resolved)

### 1. ✅ Assistant message missing tool_calls

Added `.assistantToolCalls([ToolCall])` case with `ToolCall` struct (id, name, arguments).

### 2. ✅ Tool message missing tool_call_id

Changed `.tool(String)` to `.tool(toolCallId: String, content: String)`.

### 3. ✅ Serialized type too narrow

Changed `serialized` return type from `[[String: String]]` to `[[String: Any]]`.

## Warnings

### 4. ✅ No tools field in request body

Added `Tool` struct and `tools` parameter to `make`; serialized into body when non-empty.

### 5. ✅ No stream field

Added `stream` to `Config` and conditionally serialized into request body.

### 6. ✅ No developer role

Added `.developer(String)` case to `Message`, serialized as `"role": "developer"`.

## Source

- [OpenRouter Chat Completion Request](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)
