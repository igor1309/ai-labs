---
date: 2026-09-15
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

- [ ] Cover both halves of six scenarios with tests that fail when that half
  breaks — the domain through its port, the adapter against files on disk: "A
  session starts outside Noreta", "Noreta starts after the agent", "A transcript
  contains a tool call", "A transcript contains a file diff", "Its worktree has
  been deleted", "Open a session from a deleted worktree".
- [ ] Transcript renderer, starting with the simplest presentation that keeps
  tool calls and diffs distinguishable. Its own cycle.
- [ ] A real `SessionChanges`: nothing implements the port outside tests, so
  following a session never updates.
- [ ] Search on real data: not wired into `main.ts`, and it reads every
  transcript whole — 10.7 s over 1549. Indexing is proposed in
  [implementation-notes.md](implementation-notes.md).
- [ ] Codex adapters for `SessionSource`, `TranscriptSource` and `RuntimeStates`.
- [ ] Startup and periodic reconciliation, per
  [implementation-notes.md](implementation-notes.md).
