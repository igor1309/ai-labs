---
date: 2026-03-24
model: GPT-5.4 Thinking
version: 0.0.1
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

UI depends on inner loop state/output.

That dependency is real and necessary because otherwise UI cannot:

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
AgentLoop --emits--> state/events --> UI
UI --routes--> REPL input ----------> AgentLoop
UI --routes--> control actions -----> AgentLoop
```

## Important implication

Because UI must render pending control requests, UI necessarily observes state/events originating from the running loop.

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

UI observes those emissions and decides what interaction to present.

That means the dependency chain is explicit:

```text
inner loop state -> UI affordance -> user action routing
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
4. UI depends on inner loop state/output in order to present and route control.
5. That dependency is architectural and cannot be eliminated by relabeling.

## Compact formulation

A multi-turn agent loop with escalation requires a bidirectional contract with UI:

- loop informs UI what kind of interaction is currently needed
- UI routes user action back accordingly

That is the correct simplification.
