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

### 4. No tools field in request body

Can't declare available tools. The agent needs this to tell the model what tools are available.

**Fix**: add tools to the body when provided (could come from composition as config/param).

### 5. ✅ No stream field

Added `stream` to `Config` and conditionally serialized into request body.

### 6. No developer role

Real API supports `developer` role. Rarely used, not blocking.

## Source

- [OpenRouter Chat Completion Request](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)
