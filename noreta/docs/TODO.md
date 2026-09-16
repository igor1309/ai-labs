---
date: 2026-09-16
model: claude-opus-5
description: "Noreta forward work and open questions"
---

# TODO

## Work

- [ ] **Two unreadable dates tie.** When one session is found under two project
  directories and neither copy's last activity can be read, the copy kept is
  whichever directory the file system listed first. Sorting the project
  directories would decide it the same way every run.
- [ ] Transcript renderer, starting with the simplest presentation that keeps
  tool calls and diffs distinguishable. Its own cycle. `<local-command-stdout>`
  and `<bash-stdout>` records read as user messages and carry no marker but
  their leading tag; decide there how to show them.
- [ ] A real `SessionChanges`: nothing implements the port outside tests, so
  following a session never updates.
- [ ] Search on real data: not wired into `composition-root.ts`, and it reads every
  transcript whole — 10.7 s over 1549. Indexing is proposed in
  [implementation-notes.md](implementation-notes.md).
- [ ] Codex adapters for sessions, transcripts and runtime states, each in its
  own records.
- [ ] Startup and periodic reconciliation, per
  [implementation-notes.md](implementation-notes.md). A workspace's repository is
  recorded only while a listing runs, so one created and deleted between two runs
  is never recorded, and the sessions already in that state name no repository.
