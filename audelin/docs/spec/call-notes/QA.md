# Call notes — QA

The machine is checked by its reducer and effect handler tests: each
reducer test builds the given state with a factory and states only what
changes; each is paired with an effect test for the same state and event,
with the collaborator a spy. The date formatter is a spy: not called on
start or on paths that change nothing, called once with the made date, and
its stub value is what the state holds.

## S-1 A call without notes offers to make them

The machine starts in no notes when the call has none; no effect.

## S-2 Asking starts making

Make from no notes goes to being made and asks the collaborator to make
that call's notes.

## S-3 Made notes replace the progress

Made while being made goes to made with the text and the formatted date;
no effect.

## S-4 A failure is shown

Failed while being made goes to failed with the reason; no effect.

## S-5 Trying again starts making

Retry from failed goes to being made and asks the collaborator to make.

## S-6 Cancelling returns to no notes

Cancel while being made goes to no notes and asks the collaborator to stop;
a made or failed outcome that arrives after it changes nothing.

## S-7 Asking twice makes them once

Make or retry while being made changes nothing and asks nothing.

## S-8 Notes submitted after a call

The machine started in being made shows being made and asks nothing: the
work was already asked for.
