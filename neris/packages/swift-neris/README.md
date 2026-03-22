# swift-neris

Swift package with two modules:

- **NerisCore** — library that holds all the real logic.
- **NerisCLI** — thin executable that wires things together.

## Dual-Loop Design

neris uses two cooperating loops with distinct responsibilities.

### REPL Loop (outer)

The REPL loop owns the input/output cycle. It reads user input, filters it (skip blanks, detect quit commands), passes valid input to a processor, and yields output. It is an `AsyncSequence` with a proper `AsyncIteratorProtocol` — idiomatic structured concurrency, no manual tasks or continuations.

The REPL loop is platform-agnostic. A CLI reads from stdin. A GUI reads from a text field. The loop doesn't know or care.

### Agent Loop (inner)

The Agent loop owns the multi-turn conversation. Given a user message, it calls the model, handles tool call/result cycles, and yields a stream of events (text, tool calls, tool results). One user input may produce many events across multiple model round-trips.

The Agent loop emits an event stream. Each UI consumes this stream and decides how to render each event — a CLI prints text and shows a spinner, a SwiftUI view updates published state, etc.

> **TODO:** Refactor AgentLoop from `AsyncThrowingStream` with internal `Task` to a proper `AsyncSequence` with `AsyncIteratorProtocol`, matching the REPL loop's pattern.

### How They Compose

The REPL loop's processor calls the Agent loop. The Agent loop returns an event stream. The presentation layer (CLI, GUI) maps events to output. The REPL loop yields the final result.

```
User Input → [REPL Loop] → [Agent Loop] → Event Stream → [Presentation] → Output
                  ↑                                                          |
                  └──────────────────────────────────────────────────────────┘
```

The REPL loop handles the lifecycle (read, filter, quit). The Agent loop handles the intelligence (converse, use tools, respond). Neither knows about the other's internals.
