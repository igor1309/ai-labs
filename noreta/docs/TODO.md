---
date: 2026-09-16
model: claude-opus-5
description: "Noreta forward work and open questions"
---

# TODO

## Open questions

- [ ] **Waiting for input vs waiting for approval.** Claude Code's registry
  records a free-text `waitingFor` whose commonest value, `"dialog open"`,
  covers a permission prompt and a plain question alike. "A session waiting for
  input is visible as waiting" and "A session waiting for approval is visible as
  waiting" need a source that says which, or a change to the scenarios.
- [ ] **Harness wrapper messages.** `<task-notification>`,
  `<local-command-stdout>` and `<bash-stdout>` records read as user messages;
  Claude Code sets no marker on them. Leave them, or filter on a structural
  signal.

## Work

- [ ] **A gone workspace has no repository.** `repositoryOf` asks the file
  system, so a deleted worktree answers nothing: 658 of 710 real sessions are in
  that state, and searching or grouping by repository misses all of them.
  Answering needs the repository remembered while the workspace was there, which
  needs somewhere to keep it.
- [ ] Transcript renderer, starting with the simplest presentation that keeps
  tool calls and diffs distinguishable. Its own cycle.
- [ ] A real `SessionChanges`: nothing implements the port outside tests, so
  following a session never updates.
- [ ] Search on real data: not wired into `composition-root.ts`, and it reads every
  transcript whole — 10.7 s over 1549. Indexing is proposed in
  [implementation-notes.md](implementation-notes.md).
- [ ] Codex adapters for sessions, transcripts and runtime states, each in its
  own records.
- [ ] Startup and periodic reconciliation, per
  [implementation-notes.md](implementation-notes.md).
