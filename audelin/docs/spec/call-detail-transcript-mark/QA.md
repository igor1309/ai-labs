# Call detail — marking notes from an earlier transcript — QA

CallDetail's reducer cases, each paired with an effect test for the same
state and event. The mark formatter is a spy: not called on init or for
unmarked notes, called once with the notes' version for a mark, its stub
the text in the state. The read port is a spy.

## S-1 Notes from the current transcript are unmarked

Matching identities: no mark; the spy not called.
Evidence: Missing.

## S-2 Notes from another transcript are marked

Known, differing identities: marked with the stub text; the spy called once with that version.
Evidence: Missing.

## S-3 Unknown notes are unmarked without a previous

Unknown, no previous: no mark; the spy not called.
Evidence: Missing.

## S-4 Unknown notes are marked with a previous

Unknown, a previous: marked.
Evidence: Missing.

## S-5 Each version has its own mark

Previous marked and Current not, switch each way: each version's own mark; no effect.
Evidence: Missing.

## S-6 A transcript change reads the call again

Shown call, transcript changed: the read effect for that call; a read with differing identities then marks; a read after restore with matching identities unmarks.
Evidence: Missing.
