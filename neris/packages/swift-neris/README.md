# swift-neris

Swift package with two modules:

- **NerisCore** — library that holds all the real logic.
- **NerisCLI** — thin executable that wires things together.

## Session Loop Architecture

neris uses a set of generic, stream-based primitives that compose into a bidirectional session loop with escalation support.

### Primitives

- **`REPL<Input, Event>`** — generic input loop. Reads from an `AsyncStream<Input>`, invokes a turn closure per input, forwards all turn output to a single output stream. Platform-agnostic — a CLI feeds it from stdin, a GUI from a text field.
- **`Gate<Response>`** — unbuffered actor-based signaling channel. Implements cooperative suspension/resumption for escalations. Signals sent before `wait()` are dropped by design.
- **`Router<Input>`** — stream-level decorator that classifies each event as `.repl` or `.control` based on a state predicate. Emits `RouterEvent<Input>`.
- **`StateEnvelope<Event, State>`** — async-to-sync bridge. Consumes an event stream, reduces each event to queryable state via `Mutex`. State survives stream termination.

### Protocols

- **`AgentLoop`** — generic turn executor protocol (`run(input:) -> AsyncStream<Event>`). Extension provides `compose(input:)` to wire into a `REPL`.
- **`ControllableAgentLoop`** — extends `AgentLoop` with a control stream for escalation responses. Extension provides `compose(uiEvents:initial:map:)` for full bidirectional wiring (Router + StateEnvelope + control dispatch).

### Concrete Types

- **`ToolUseLoop`** — actor implementing the tool-use conversation loop. Manages message history, calls model via `Respond` closure, executes tools via `Execute` closure, yields events (text, toolCall, toolResult).
- **`NerisAgent`** — composition root wiring `ToolUseLoop` to OpenRouter provider.

### How They Compose

```
UI Events → [Router] → .repl ──→ [REPL] → [AgentLoop.run] → Event Stream
                 │                                                  │
                 │                                          [StateEnvelope]
                 │                                                  │
                 └──── .control → [ControllableAgentLoop] ←── query()
```

The Router classifies input based on StateEnvelope state. REPL drives turn execution. StateEnvelope tracks whether the agent is awaiting control (escalation). Control events reach the agent loop through a separate stream.

## Next

- **Streaming (SSE)** — switch from batch responses to server-sent events.
- **Skills and tools** — expand beyond `read_file`.
- **Observability** — capture interactions for comparison across configurations.
- **Configuration** — model selection via config file or CLI flags.
- **Conversation persistence** — messages are in-memory only.
- **NerisAgent test coverage** — system prompt prepending and tool dispatch.
- **Error messages** — improve user-facing error output.
