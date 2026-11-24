# ADR-003: Live call transcript as an event stream

Status: accepted.

## Context

An assistant should help during a call: read the live transcript and offer
hints from project context. Rereading a growing transcript on every step
repeats work, and making the assistant cut its own windows spends tokens and
latency on mechanics that need no model. Products and open-source tools that
assist live calls are surveyed in `research/live-call-assistants.md`.

## Decision

1. **A separate event source, outside the app.** It reads the call's
   existing `transcript.md` and emits a stream of three event types: `chunk`
   (the next window of text, cut by a size and an overlap the client
   gives, such as 3 minutes overlapping by 1), `noCall` and
   `callEnded`, over SSE first. The app does not change.
2. **The source holds no model and no policy.** What to do with chunks
   (summarise, hint, stay silent) is each client's choice.
3. **The recent tail is not reconciled.** The last rows of a live transcript
   can still be revised; over a call the difference is negligible, so a chunk
   is sent as the file shows it and later revisions of sent text are not
   re-sent.
4. **Clients depend on an abstract event source,** not on Audelin, and are
   tested against a fake one.

## Consequences

- The transcript format becomes a contract for an outside reader. Regression tests
  on it keep the source's reading true; the same contract would bind a
  source inside the app.
- The source is small, isolated and has no model cost; silence costs nothing.
- A client can keep a rolling summary from overlapping windows without
  rereading the call.
- Open for the source's spec: chunk size units, joining mid-call, detecting
  the end of a call, access to the transport.
