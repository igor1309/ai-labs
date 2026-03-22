# Log

## 2026-03-22
- Evolve AgentLoop to structured tool calls (ToolCall with id/name/arguments, multi-call per response). Add bidirectional adapters between AgentLoop and OpenRouter types. Smoke test against real OpenRouter endpoint with free model.
- Align OpenRouter components with real API: add developer role, stream flag, tools field, tool_call_id, assistantToolCalls. Organize under Sources/Core/API/OpenRouter with README documenting covered surface and intentional omissions.
- Add OpenRouterResponseParser: parses OpenRouter chat completion responses. Handles text, parallel tool calls, status codes, finish reasons (stop/length/error). Owns Response enum and ToolCallResponse. Internal, promoted to Sources/Core.
- Add OpenRouterRequestFactory: builds URLRequests for OpenRouter chat completions API. Owns Message enum and Config, no domain coupling. Internal, promoted to Sources/Core.
- Add NetworkClient<Input, Output>: generic 3-dep pipeline (request factory, transport, response parser) for reusable networking. Public, promoted to Sources/Core.

## 2026-03-21
- AgentLoop actor with streaming events (toolCall, toolResult, text), multi-turn message history, error propagation and recording, re-entrancy guard. TDD in test file, not yet promoted to production.
- Initialize neris project: add brand brief and docs scaffolding.
