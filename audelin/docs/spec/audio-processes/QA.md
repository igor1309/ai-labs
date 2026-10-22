# Audio processes — QA

The translation (Core Audio's process objects to the answer) runs through
a fake of the binding. The binding runs for real against this Mac's own
list, with `afplay` playing a muted tone. Recording is driven through the
fake only, so no row needs a microphone.

## S-1 A process with audio open is listed

Real: a muted `afplay` is in the list with its name. Evidence: Missing.

## S-2 A playing process is shown as playing

Real: the `afplay` process is shown as playing. Evidence: Missing.

## S-3 A recording process is shown as recording

Fake: an object whose input-running flag is set is shown as recording.
Evidence: Missing.

## S-4 A process with no bundle id is listed by name

Fake: an object with no bundle id is named by its executable. Real:
`afplay`, which has none, is listed as `afplay`. Evidence: Missing.

## S-5 Audelin is marked as itself

Fake: the object whose pid is the test's own is marked. Evidence: Missing.

## S-6 A process that quit is gone

Real: after `afplay` exits, a new ask does not list it. Evidence: Missing.

## S-7 A list the system refuses fails

Fake: the binding refuses the list; the ask fails. Evidence: Missing.

## S-8 A silent process is listed

Fake: an object whose output-running flag is clear is in the answer, shown
as not playing. Evidence: Missing.
