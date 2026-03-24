---
date: 2026-03-24
model: opus 4.6
version: 0.0.1
title: Design Note: Session Loop as Architectural Primitive for Agent Systems
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

The turn is a dependency of the session loop. Since the session loop is a generic component, the turn must conform to a protocol — a contract that defines what the session loop can expect.

The turn contract has three possible outcomes:

- **Completion** — the turn produces a result and optional state mutations.
- **Cancellation** — the turn is signaled to stop. It cooperates by winding down at its natural suspension points and returns partial state.
- **Suspension** — the turn yields an escalation request (tool permission, user confirmation, clarification) and provides a continuation. The session resolves the escalation and resumes the turn.

The turn does not know about I/O, the user, or the session lifecycle. It receives a constructed input (assembled from user input, system configuration, session state, and whatever else is relevant) and produces output through the protocol.

## Component Architecture

Four components, each defined by protocol-based interfaces. No component knows the concrete type of any dependency.

### UI

Thin. Emits a stream of untyped text events (user input). Consumes a stream of output events for rendering. Has no knowledge of session state, agent state, or routing. Future evolution may introduce typed input events (approve/deny controls, structured responses) to reduce ambiguity at the source, but the baseline is untyped text.

### Router

Consumes the UI event stream. Observes agent loop state (read-only). Produces two output streams: one directed to the REPL (new turn input), one directed to the AgentLoop (control signals and escalation responses).

This component exists because user input is inherently untyped — "use supabase" could be a fresh instruction or a permission grant, and only the current system state disambiguates. The router is the single place where this classification happens. Its sole responsibility is: given the current agent loop state and an incoming UI event, decide who receives it.

The router does not manage turns, handle escalations, or forward output. It classifies and directs.

### REPL

The session loop itself. Consumes its input stream from the router. Invokes the agent loop to execute turns. Forwards agent output to the UI. Manages session lifecycle (start, resume, fork).

The REPL holds an optional continuation, wired at construction. When the agent loop suspends with an escalation, the continuation is set. The REPL's responsibility is session-level orchestration — not multiplexing all channels or managing agent internals.

### AgentLoop

Executes turns. Exposes observable state as a published property or stream: idle, running, or suspended (with an associated escalation request). Consumes a control stream (cancellation signals, escalation responses) from the router. Produces an output stream (responses, streaming chunks, partial results).

The agent loop does not know about the UI, the router, or the REPL. It depends only on its turn strategy (protocol-typed), its control input stream, and whatever session state it receives per invocation.

## Wiring

All connections are established at the composition root. Each component declares its dependencies as protocol-typed properties or constructor parameters. The composition root creates concrete instances and injects them.

- UI event stream → Router input
- AgentLoop published state → Router observation
- Router REPL stream → REPL input
- Router control stream → AgentLoop control input
- AgentLoop output stream → UI output (via REPL or directly, depending on design)
- AgentLoop continuation → REPL (wired at construction)

Every component is testable in isolation with protocol-conforming stubs. The topology is explicit at the composition root and invisible to the components themselves.

## Key Design Decisions Left Open

- **Session state boundary**: what constitutes session state, how it is serialized, and what transfers on fork.
- **Turn strategy selection**: how the system decides which turn implementation to use for a given input (router within the turn, product-level configuration, or dynamic selection).
- **Escalation protocol**: the concrete types of escalation requests and responses.
- **Partial output on cancellation**: whether cancelled turns produce usable partial results or are discarded.
- **Output routing**: whether agent output flows through the REPL to UI or is a direct stream, and what the REPL's role is in shaping output.