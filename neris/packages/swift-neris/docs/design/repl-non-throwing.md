---
date: 2026-03-25
model: claude-opus-4-6
description: "REPL uses non-throwing AsyncStream; errors are the turn's concern"
---

# REPL Non-Throwing Design Decision

## Context

The old `Loop` type used `AsyncThrowingStream` for turn output. In the CLI, a throwing turn kills the entire loop — the CLI had to wrap it in `while true { do { for try await } catch }` to recover from a single network error.

## Decision

REPL's turn returns `AsyncStream<Event>` (non-throwing). Error handling is the turn's responsibility, not the loop's.

## Rationale

- Most errors in a CLI REPL are recoverable (network, timeout). They shouldn't break the session.
- The turn closure decides error policy: emit an error event, print, retry, or ignore.
- Fatal errors (auth failure) are checked before the loop starts or modeled as terminal events.
- Non-throwing simplifies the caller: `for await event in repl.run()` — no restart wrapper needed.
