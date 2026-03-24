---
date: 2026-03-24
version: 0.0.2
title: Session Loop as Architectural Primitive for Agent Systems
format: design-note
---

# Design Note: Session Loop as Architectural Primitive for Agent Systems

## Scope

This note describes a mental model and component architecture for a specific class of agent systems — those that support sessions, memory, turns, and tool use. This is not a universal model for all agent systems. It is, however, an essential outermost architectural component for modern interactive agent systems.

## Mental Model: The Session Loop

The core insight: an interactive agent system's outermost structure is a session loop. This is the same structure as a REPL — Read, Eval, Print, Loop — but the correspondence is architectural, not trivial. The session loop is where persistence, lifecycle, context assembly, and state management live. It is complex by nature.

The session loop provides three primitives:

- **Start** — create a fresh session with initial state.
- **Resume** — restore an existing session's state and continue.
- **Fork** — branch from an existing session's state into a new session.

Each iteration of the loop is a **turn**. The turn is an opaque, asynchronous, controllable operation. What happens inside the turn — a single LLM call, a multi-step planner, a sub-agent orchestration, a simple router — is an implementation detail of the concrete system. The session loop is parameterized by its turn implementation.

This separation is the architectural value: the session loop is the stable skeleton, the turn is the extension point. A simple product might plug in a single-call turn. A complex product might plug in a multi-agent orchestrator. The outer loop does not change.

## The Agent Turn Contract

The turn contract has three possible outcomes:

- **Completion** — the turn produces a result and optional state mutations.
- **Cancellation** — the turn is signaled to stop. It cooperates by winding down at its natural suspension points and returns partial state.
- **Suspension** — the turn yields an escalation request (tool permission, user confirmation, clarification) and provides a continuation. The session resolves the escalation and resumes the turn.

The turn does not know about I/O, the user, or the session lifecycle. It receives a constructed input (assembled from user input, system configuration, session state, and whatever else is relevant) and produces output through the protocol.

## Component Architecture

Four components, each defined by protocol-based interfaces.

### UI

Thin. Emits a stream of untyped text events (user input). Consumes a stream of output events for rendering. Has no knowledge of session state, agent state, or routing. Future evolution may introduce typed input events (approve/deny controls, structured responses) to reduce ambiguity at the source, but the baseline is untyped text.

### Router

Consumes the UI event stream. Observes agent loop state (read-only). Produces two directed streams: one for the REPL (new turn input), one for the AgentLoop (control signals and escalation responses).

User input is inherently untyped — "use supabase" could be a fresh instruction or a permission grant. Only current system state disambiguates. This classification must happen somewhere, and the Router exists to keep that knowledge out of the UI. The system-level dependency on agent loop state is real and irreducible, but it belongs to the Router, not the UI. The Router is effectively a decorator on the UI's output stream: it wraps the raw event stream with state-aware direction. The UI remains a thin, stateless stream.

The Router does not manage turns, handle escalations, or forward output. It classifies and directs.

### REPL

The session loop itself. Consumes its input stream from the router. Invokes the agent loop to execute turns. Forwards agent output to the UI. Manages session lifecycle (start, resume, fork).

The REPL holds an optional continuation, wired at construction. When the agent loop suspends with an escalation, the continuation is set. The REPL's responsibility is session-level orchestration — not multiplexing all channels or managing agent internals.

### AgentLoop

Executes turns. Exposes observable state as a published property or stream: idle, running, or suspended (with an associated escalation request). Consumes a control stream (cancellation signals, escalation responses) from the router. Produces an output stream (responses, streaming chunks, partial results).

The agent loop does not know about the UI, the router, or the REPL. It depends only on its turn strategy (protocol-typed), its control input stream, and whatever session state it receives per invocation.

## Wiring

All connections are established at the composition root. Each component declares its dependencies as protocol-typed constructor parameters.

- UI event stream → Router input
- AgentLoop published state → Router observation
- Router REPL stream → REPL input
- Router control stream → AgentLoop control input
- AgentLoop output stream → UI output (via REPL or directly, depending on design)
- AgentLoop continuation → REPL (wired at construction)

## Cooperative Interruptibility

For control actions like `stop` to feel responsive, the agent turn must be cooperatively interruptible. This is an architectural constraint on turn implementation: turns should consist of small steps with frequent cancellation checkpoints at natural suspension points (before the next LLM call, before tool execution, between planning steps). Long uninterruptible sections should be avoided where possible.

Without this, `stop` means "stop at next checkpoint" — which may be acceptable, but the latency is a product decision that should be made explicitly, not discovered at runtime.

## Companion Note

See *Agent Loop, REPL, and Control Routing* for a complementary perspective focused on the bidirectional contract between loop and UI, and the architectural necessity of the state dependency.

## Key Design Decisions Left Open

- **Session state boundary**: what constitutes session state, how it is serialized, and what transfers on fork.
- **Turn strategy selection**: how the system decides which turn implementation to use for a given input (router within the turn, product-level configuration, or dynamic selection).
- **Escalation protocol**: the concrete types of escalation requests and responses.
- **Partial output on cancellation**: whether cancelled turns produce usable partial results or are discarded.
- **Output routing**: whether agent output flows through the REPL to UI or is a direct stream, and what the REPL's role is in shaping output.