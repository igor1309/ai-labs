# Recordings — QA

An async machine: each row is reducer cases, one line each, with the
effect each event asks for, and effect handler cases that drive a spy of
the calls adapter and a spy of the preferences store and check the result
event delivered. Compose's wiring (the calls folder condition during a
move, a fresh listing after a result) is tested in Compose with the real
machine and spies. Real calls (LAB-746, LAB-747) prove the whole path.

## S-1 Renaming a call

Idle, rename call A to a title: renaming A, effect rename. Renamed: idle,
effect list. The handler renames through the adapter and delivers renamed.

## S-2 A failed rename is named

Renaming A, rename failed with a reason: idle with the failure naming A
and the reason, no effect. The handler delivers the adapter's error as
the failure.

## S-3 A delete waits for the confirm

Idle, ask to delete A: asking about A, no effect. Cancel: idle. A second
ask while asking replaces the first.

## S-4 A confirmed delete removes the call

Asking about A, confirm: deleting A, effect delete. Deleted: idle, effect
list. A failed delete names A and the reason.

## S-5 The call being recorded is left alone

With A recorded: rename A, ask to delete A and confirm a delete of A
(recording began after the ask) each leave the state as it was, with no
effect. Rename of B goes on.

## S-6 One action at a time

Renaming A: rename B, ask to delete B and pick a folder each change
nothing. Likewise while deleting and moving.

## S-7 A move is asked with its size

Idle, folder picked: counting, effect count. Counted 52 calls of 135 MB:
asking to move 52 (135 MB) to the folder. Cancel: idle. Picking the
current folder changes nothing.

## S-8 A confirmed move moves every call

Asking to move, confirm: moving with progress 0 of 52, effect move the
oldest call. Each moved call raises the progress by one and its bytes,
and asks for the next. The last moved: effect store the folder, then
stored: idle, effect list. The handler moves through the adapter and
stores through the preferences spy, once.

## S-9 A failed move keeps the old folder

Moving with 31 moved, a call failed with a reason: failed, naming 31 of
52, the call and the reason; the folder is not stored.

## S-10 A retried move moves the rest

Failed, retry: moving from 31, effect move the next call left. The calls
moved before are not moved again.

## S-11 No move during a recording

Recording, folder picked: refused while recording, no effect. The
recording ends: idle.

## S-12 No recording during a move

Compose: while Recordings is moving, the calls
folder condition reads not available, and it reads available again when
the move ends or fails; a call start during the move begins no recording
until then.
