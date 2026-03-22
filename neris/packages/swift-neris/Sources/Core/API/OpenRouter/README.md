---
date: 2026-03-22
model: claude-opus-4-6
description: "OpenRouter API integration: request factory and response parser"
---

# OpenRouter

Request/response layer for the [OpenRouter Chat Completion API](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request).

## Components

| Component | Role |
|-----------|------|
| `OpenRouterRequestFactory` | Builds `URLRequest` for chat completions |
| `OpenRouterResponseParser` | Parses chat completion responses |

## Covered API surface

- **Messages**: all roles — `user`, `assistant`, `system`, `developer`, `tool`
- **Assistant tool calls**: `id`, `type`, `function.name`, `function.arguments`
- **Tool response**: `tool_call_id` + `content`
- **Tools**: function definitions with `name`, `description`, `parameters`
- **Stream**: conditionally included when enabled
- **Auth**: Bearer token via `Authorization` header

## Intentional omissions

Not needed by the agent loop yet. Add when a consumer requires them.

- **Sampling**: `temperature`, `top_p`, `frequency_penalty`, `presence_penalty`, `max_completion_tokens`, `seed`, `logprobs`, `logit_bias`
- **Response format**: `json_object`, `json_schema`, `grammar`, `python` — structured output is handled via tool calls, not direct text constraints
- **Tool choice**: `auto`/`none`/`required`/specific function — implicit `auto` is sufficient
- **Routing**: `models` (fallback), `provider` preferences, `plugins`
- **Observability**: `user`, `session_id`, `trace`, `metadata`
- **Advanced**: `reasoning` (effort), `cache_control`, `stop` sequences, `parallel_tool_calls`, `stream_options`
- **Multimodal**: `image_url`, `input_audio`, `video_url`, `file` content items
- **Message extras**: `name` field, `refusal`, `reasoning_details`, `images`, `audio` on assistant messages
- **Built-in tools**: `openrouter:datetime`, `openrouter:web_search`
