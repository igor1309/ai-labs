# Transcript file — QA

An adapter over a file, so every row runs against real files in a fresh
temporary folder, never the user's own. Text is written as numbered
segments on both sides, so a read proves which text came back: a row reads
the file from outside the adapter and checks its parts, never just that a
call was made. Where the file system will not fail on cue, a row runs
through a fake of the file binding, as spec-process allows. The real call
of the user spec (LAB-408) proves the whole path.

## S-1 Written text can be read

Four numbered segments, mine and theirs interleaved, are written; the file
holds each in the order given, marked mine or theirs, with its start time.
Settled-only, pending-only and mixed segments are written; the file holds
all their words, settled and pending. Evidence: Missing.

## S-2 Revised text replaces what it revised

Segments with pending text are written, then the same segments settled
with different words; the file holds only the settled words. A segment
dropped by the revision is gone. Evidence: Missing.

## S-3 Text filled in later is marked

Live segments and segments marked written later are written; only the
latter are marked as filled in later. Evidence: Missing.

## S-4 A closed transcript keeps the last text

Three writes, then close; the file holds the third write's text.
Evidence: Missing.

## S-5 A transcript with no text is kept

Open, then close with no write; the file exists and says no text was
heard. Evidence: Missing.

## S-6 A crash keeps the last whole text

A helper process opens a transcript through a binding that pauses a
chosen write after writing beside the file and before renaming, and says
so; it writes numbered texts, reports each once its write returns, and is
killed with SIGKILL while paused. The file read independently holds
exactly the last reported text, whole, and a later open at another place
in the folder is not tripped by the left temporary. A second run pauses
just after the rename and finds the new text whole. Evidence: Missing.

## S-7 A transcript that cannot be opened fails

Opening in a folder that does not exist, and in one without write
permission, fails and leaves no file. Through the binding fake, creation
succeeds and its first sync fails; the open fails, no file is left, and a
second open at the same place succeeds. Evidence: Missing.

## S-8 A transcript never overwrites a file

A file, and a symlink to a file, already at the place; the open fails and
both are byte for byte unchanged. Evidence: Missing.

## S-9 A failed write is told and keeps the last text

Through the binding fake, a write fails at each step: writing beside,
flushing, renaming. Each fails the write, the file holds the last text
whose write returned, and no temporary file is left. Evidence: Missing.

## S-10 A write after a failed one works

After each failure of S-9, the next write returns and the file holds its
text. Evidence: Missing.

## S-11 Writing no text keeps saying none was heard

Open, write no text, write no text again; the file says no text was
heard. Then text, then no text: the file says no text was heard.
Evidence: Missing.
