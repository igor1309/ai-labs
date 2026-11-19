# Recordings — what can start beside a transcript run — QA

An async machine: each row is reducer cases with the effect each event
asks for, paired with effect tests for the same state and event. Message
formatters are spies: not called on init or when nothing is refused, called
once per refusal with the exact payload, their stub text the reason in the
state. Ports are spies whose completions are delivered as result events; a
fresh listing is a distinct fake listing whose contents and selection are
asserted. A row without evidence is Missing.

## S-1 A whole idle call offers a run

Idle, nothing under way, a listing with both tracks: the row offers a run.
Evidence: Missing.

## S-2 A call missing one track

A call without its call track: not offered; the formatter gets that call and track.
Evidence: Missing.

## S-3 A call missing all audio

A call with no tracks: not offered; the formatter gets both tracks.
Evidence: Missing.

## S-4 A nested merge missing a track

A merge of a merge whose innermost call lacks a track: not offered; that call and track named.
Evidence: Missing.

## S-5 Offers follow idleness

An offered row, then not idle: the row no longer offers, with the busy reason; no effect.
Evidence: Missing.

## S-6 A request is checked again

Offered row, not idle arrives, then the request: no effect; the busy reason.
Evidence: Missing.

## S-7 A run waits for a merge

A merge under way, ask for a run: no effect; the reason.
Evidence: Missing.

## S-8 A run's own call cannot be renamed

Run under way, rename that call: no effect; the reason.
Evidence: Missing.

## S-9 Another call stays usable

Run under way, rename another call: the rename effect for that call.
Evidence: Missing.

## S-10 The layout is locked during a run

Run under way, each of merge, move and restore: no effect; each reason.
Evidence: Missing.

## S-11 Restore is offered only when it can start

A call with a previous, idle, nothing under way: offers restore; not idle: no longer offers, with the reason.
Evidence: Missing.

## S-12 A run's own call cannot be deleted

Run under way, delete that call: no effect; the reason.
Evidence: Missing.
