# swift-neris

Swift package with two modules:

- **NerisCore** — library that holds all the real logic.
- **NerisCLI** — thin executable that wires things together.

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

Actor implementing multi-turn tool-use conversation. Given a user message, calls the model, handles tool call/result cycles, yields events. Maintains message history across turns.

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
- **Conversation persistence** — messages are in-memory only.
- **NerisAgent test coverage** — system prompt and tool dispatch logic.
- **Error messages** — improve user-facing error output.
