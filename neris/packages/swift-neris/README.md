# swift-neris

Swift package with two modules:

- **NerisCore** — domain logic, API integration, session primitives.
- **NerisCLI** — composition root executable.

## Architecture

### Session primitives (`Sources/Core/Session/`)

Generic, reusable stream machinery with no domain knowledge:

- **REPL\<Input, Event\>** — reads an input stream, invokes a turn closure per input, forwards turn output. Non-throwing by design — errors are the turn's concern, not the loop's.
- **REPL.cli** — static factory that builds a REPL from a pull-based reader with `FilterResult`-based input filtering (skip blanks, quit commands, trim whitespace).
- **Gate\<Response\>** — unbuffered actor for cooperative suspend/resume signaling. Turns suspend at escalations via `wait()`, controllers resume via `signal()` or `cancel()`.
- **Router\<Input\>** — classifies each event as `.repl` or `.control` based on an `expectsControl` closure.
- **StateEnvelope\<Event, State\>** — reduces an async event stream to a synchronously queryable state via `Mutex`.
- **AgentLoop protocol** — `run(input:) -> AsyncStream<Event>` with a `compose(input:)` extension that wires a REPL.
- **ControllableAgentLoop protocol** — extends AgentLoop with `start(observing:)` for control delivery. `compose(uiEvents:initial:map:)` builds the full feedback loop: Router → REPL + StateEnvelope + control stream.

### ToolUseLoop (`Sources/Core/ToolUseLoop.swift`)

Stateless `final class` implementing multi-turn tool-use conversation. Given a user message, calls injected `respond`/`execute` closures, handles tool call/result cycles, yields events. Message history is owned by an injected `Store` protocol — `InMemoryStore` conforms at the composition layer.

### Infrastructure (`Sources/Core/Infra/`)

- **InMemoryStore\<Element\>** — generic thread-safe collection backed by `Mutex`. Conforms to `ToolUseLoop.Store` at the composition layer.

### API (`Sources/Core/API/OpenRouter/`)

- **OpenRouterRequestFactory** — builds `URLRequest`s for the OpenRouter chat completions API.
- **OpenRouterResponseParser** — parses chat completion responses (text, parallel tool calls, status codes, finish reasons).
- **NetworkClient\<Input, Output\>** — generic 3-dep pipeline (request factory, transport, response parser).

### NerisAgent (`Sources/Core/NerisAgent.swift`)

Composition root that wires `NetworkClient`, `OpenRouter` adapters, `InMemoryStore`, and `ToolUseLoop` into a working agent with system prompt and tool dispatch.

### Composition

```
User Input → [REPL] → [ToolUseLoop] → Event Stream → [Presentation] → Output
                 ↑                                                       |
                 └───────────────────────────────────────────────────────┘
```

For controllable sessions (escalation/approval flows):

```
UI Events → [Router] → .repl → [REPL] → [AgentLoop] → events → [StateEnvelope]
                    └→ .control → [AgentLoop.start(observing:)]        ↓
                         ↑                                      query() → Router
```

## Next

- **Streaming (SSE)** — server-sent events for incremental text rendering.
- **Skills and tools** — expand beyond `read_file`.
- **Observability** — capture interactions for comparison across configurations.
- **Configuration** — model selection via config file or CLI flags.
- **Conversation persistence** — messages stored via `InMemoryStore`; disk persistence not yet implemented.
- **NerisAgent test coverage** — system prompt and tool dispatch logic.
- **Error messages** — improve user-facing error output.
