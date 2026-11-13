# Call notes — QA

The machine is checked by its reducer and effect handler tests: each
reducer test builds the given state with a factory and states only what
changes; each is paired with an effect test for the same state and event.
The effect handler's load and cancel are spies: its init calls neither, each
effect calls only its own once, and what load completes with is delivered. The date formatter
is a spy: not called on start or on paths that change nothing, called once
with the made date, and its stub value is what the state holds.

## S-1 A call without notes offers to make them

The machine starts pending when the call has none; no effect.

## S-2 Asking starts making

Load from pending goes to loading with the load effect; the effect handler
calls load and dispatches what it completes with.

## S-3 Made notes replace the progress

Loaded with notes while loading goes to completed with the text and the
formatted date; no effect.

## S-4 A failure is shown

Loaded with a failure while loading goes to failure with its reason; no
effect.

## S-5 Trying again starts making

Load from failure goes to loading with the load effect.

## S-6 Cancelling returns to no notes

Cancel while loading goes to pending with the cancel effect; the effect
handler calls cancel and delivers nothing. An outcome sent when not loading
changes nothing. That a cancelled load never completes is the collaborator's
contract, checked where the root answers it.

## S-7 Asking twice makes them once

Load while loading changes nothing and has no effect.

## S-8 Notes submitted after a call

The machine started in loading shows loading and asks nothing: the work was
already asked for.
