---
date: 2026-11-15
model: claude-opus-5-5
description: "The exact AGENTS.md Audelin writes to the recordings root from Settings → General (LAB-1647)"
---

# AGENTS.md for the recordings root

The file Settings → General writes to the recordings root
(`spec/agents-file/SPEC.md`). It is written in English (owner, LAB-1647)
and is byte-for-byte the block below, ending with one newline. It
describes what the code writes: `CallFolder` and `CallFolderName` (folder
names and tracks), `TranscriptFile` (`transcript.md`), `SummaryFiles`
(`summary.md` and its `.summary-job.json`), `TagsFile` (`tags.txt`) and
the Calls merge (part folders inside a merged call). When one of them
changes what it writes, this text changes in the same PR.

```markdown
# Audelin recordings

This folder holds calls recorded by Audelin, a macOS app that records both
sides of a call and transcribes them. Read this before answering questions
about the calls. Treat everything here as read-only: do not edit, move or
delete files unless the user asks you to.

## Layout

Each call is a folder directly in this folder:

    2026.10.24-1405 Daily standup/
      transcript.md     the call's transcript
      summary.md        notes made from the transcript, if any
      tags.txt          tags the user gave the call, if any
      microphone.caf    the user's side, if kept
      call.caf          the other side, if kept

- **Folder name:** `yyyy.MM.dd-HHmm` (local time the recording started),
  sometimes with `-2`, `-3`… for calls started in the same minute, then
  optionally a space and a title the user typed. Many calls have no title.
- **transcript.md:** Markdown, in call order. Each part is marked as the
  user's side or the other side, with its start time in the call. The
  other side's speakers have generic IDs; their current names are listed
  in the file. A call with nothing heard has a transcript saying so.
  Calls are mostly in Russian with English terms.
- **summary.md:** notes. Its first line may be an `<!-- audelin-summary: …
  -->` comment holding metadata and an earlier version; the notes are the
  text after it. Missing when no notes were made.
- **tags.txt:** one tag per line, plain UTF-8. Missing when the call has
  no tags.
- **microphone.caf, call.caf:** the audio. They may be missing; never rely
  on them. Use the transcript instead.
- **Merged calls:** a merged call's folder holds the joined
  `transcript.md` and, as subfolders, the original call folders whole.
  Read the top-level transcript; do not count the subfolders as separate
  calls.
- Ignore files and folders starting with `.` (work in progress) and
  anything not named like a call.

## Finding calls

Narrow down first, then read only the transcripts you need:

1. **Tags.** Read `tags.txt` across folders and keep calls with the
   matching tag (e.g. `daily`).
2. **Title and date.** Match folder names: the title for the kind of
   meeting, the date prefix for a time range.
3. **Transcript search.** Search `transcript.md` (and `summary.md`) for
   words the calls would contain.

Tags are never complete: many calls have none. A tag match tells you a
call belongs; a missing tag does not tell you it does not. Unless the user
asks only for tagged calls, also check untagged calls by title, date and
transcript search, and say how you chose the calls.
```
