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

- [ ] **Runtime state is frozen when the source is made.**
  `claudeCodeRuntimeStates` reads the registry once and every later lookup
  answers from that copy, while `claudeCodeSessions` re-reads the transcripts on
  every call. A long-lived source therefore shows a new session as inactive and
  a finished one as still running. `main.ts` reads once and exits, so nothing
  shows it yet.
- [ ] **No adapter sets `repository`.** Only the test doubles supply it, so
  searching and grouping by repository never match on real sessions.
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
