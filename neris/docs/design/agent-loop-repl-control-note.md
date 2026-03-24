---
date: 2026-03-24
model: GPT-5.4 Thinking
version: 0.0.2
title: Agent Loop, REPL, and Control Routing
format: architecture-note
---

# Agent Loop, REPL, and Control Routing

## Scope

This note captures the simplified architectural conclusion for a multi-turn agent loop with:

- normal task input through REPL
- control actions such as stop / approve / deny
- agent escalation that waits for control without killing the loop

## Core conclusion

The routing layer depends on inner loop state/output, and decorates the UI stream accordingly.

That dependency is real and necessary because otherwise the system cannot:

- present a control request
- know that approval is pending
- render the right affordance for approve / deny / stop
- route the resulting user action correctly

Trying to hide that dependency by renaming it as “projection”, “public interaction state”, or similar does not remove the dependency. It only changes how it is packaged.

## Main split

### REPL

REPL is for normal multi-turn task input.

Examples:

- “use this instead”
- “try another API”
- “add retries”

### Control

Control is for runtime / policy actions.

Examples:

- stop
- approve
- deny
- pause
- resume

## Key property

Agent escalation does not kill the loop.

When the loop needs approval or another control decision, it moves into a waiting state and remains alive. After control arrives, it resumes.

Minimal state transition:

```text
running -> awaiting_control -> running
```

## Architectural shape

```text
AgentLoop --emits--> state/events --> Routing layer --> decorated UI stream --> UI
UI/user actions --------------------> Routing layer --> REPL input ----------> AgentLoop
UI/user actions --------------------> Routing layer --> control input -------> AgentLoop
```

## Important implication

Because the system must render pending control requests, the routing layer necessarily observes state/events originating from the running loop and decorates the UI stream accordingly.

Therefore:

- REPL is not the sole user-facing ingress anymore
- control is not purely external to loop semantics
- routing cannot be reasoned about without loop state

## Swift-oriented interpretation

`AgentLoop` is naturally a stateful async runtime object, likely an `actor`.

It owns loop state such as:

- running
- awaiting control
- paused
- stopped

It emits state/events outward.

A routing layer observes those emissions and decides what interaction to present by decorating the UI stream.

That means the dependency chain is explicit:

```text
inner loop state -> routing layer -> UI affordance -> user action routing
```

## Tight-leash control

For `stop` to feel near-immediate, the loop must be cooperatively interruptible.

Practical consequence:

- small turns
- frequent control/cancellation checkpoints
- cancellable awaits
- no long uninterruptible sections if avoidable

Otherwise `stop` means “stop at next checkpoint”, not truly immediate stop.

## Decision summary

1. REPL handles task input, not control.
2. Control is a separate class of interaction.
3. Agent escalation keeps the loop alive and waiting.
4. The routing layer depends on inner loop state/output in order to decorate the UI stream and route control.
5. That dependency is architectural and cannot be eliminated by relabeling.

## Compact formulation

A multi-turn agent loop with escalation requires a bidirectional contract mediated by a routing layer:

- loop informs the routing layer what kind of interaction is currently needed
- the routing layer decorates the UI stream accordingly
- user action is routed back through that layer

That is the correct simplification.
