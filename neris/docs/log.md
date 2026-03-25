# Log

## 2026-03-25
- Extract message state from ToolUseLoop into injected Store protocol. ToolUseLoop is now a stateless `final class: Sendable`. InMemoryStore conforms at composition layer. 8 new store spec tests.
- Promote session loop PoC types to production: REPL, Gate, Router/RouterEvent, StateEnvelope, AgentLoop/ControllableAgentLoop protocols with compose extensions. All public.
- Add REPL.cli static factory with FilterResult-based input filtering. Replace Loop with REPL.cli in CLI. Delete Loop and LoopTests.
- Rename AgentLoop actor to ToolUseLoop to free the name for the protocol.
- Organize Sources/Core into Session/ subdirectory for generic stream primitives. Rename Tests/Core/SessionLoop to Tests/Core/Session.
- Add GateTests (6 tests) and REPLCLITests (7 tests).
- Add design decisions policy to AGENTS.md and static factories rule.
- Record REPL non-throwing design decision in docs/design/.
- Add InMemoryStore\<Element\> generic Mutex-based store in Core/Infra/ with seeded init. 5 tests.

## 2026-03-24
- Prove SessionLoop architecture through isolated PoC test suite: REPL (sequential input processing), Gate (unbuffered escalation signaling), Router (state-aware input demux), StateEnvelope (async-to-sync Mutex bridge), AgentLoop/ControllableAgentLoop protocols with compose extensions, full bidirectional feedback loop (forward + reverse routing flip). 22 tests across 4 suites.
Add **Session Loop** design notes.

## 2026-03-22
- Wire full composition: NerisAgent composer, read_file tool, system prompt, CLI error recovery, thinking spinner. Delete Agent stub.
- Make Loop generic (`Loop<Element>`) with streaming processor. Revert accidental public exposure of Core types. CLI UX: version message, input prompt.
- Evolve AgentLoop to structured tool calls (ToolCall with id/name/arguments, multi-call per response). Add bidirectional adapters between AgentLoop and OpenRouter types. Smoke test against real OpenRouter endpoint with free model.
- Align OpenRouter components with real API: add developer role, stream flag, tools field, tool_call_id, assistantToolCalls. Organize under Sources/Core/API/OpenRouter with README documenting covered surface and intentional omissions.
- Add OpenRouterResponseParser: parses OpenRouter chat completion responses. Handles text, parallel tool calls, status codes, finish reasons (stop/length/error). Owns Response enum and ToolCallResponse. Internal, promoted to Sources/Core.
- Add OpenRouterRequestFactory: builds URLRequests for OpenRouter chat completions API. Owns Message enum and Config, no domain coupling. Internal, promoted to Sources/Core.
- Add NetworkClient<Input, Output>: generic 3-dep pipeline (request factory, transport, response parser) for reusable networking. Public, promoted to Sources/Core.

## 2026-03-21
- AgentLoop actor with streaming events (toolCall, toolResult, text), multi-turn message history, error propagation and recording, re-entrancy guard. TDD in test file, not yet promoted to production.
- Initialize neris project: add brand brief and docs scaffolding.
