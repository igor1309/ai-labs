# Log

## 2026-09-15
- A session's repository is read from git's layout beside its workspace: a
  worktree names the repository it belongs to, a workspace that is gone names
  none.
- Runtime state is read on every source read, so a session that starts or stops
  while Noreta runs is seen.
- Every QA scenario is covered on both sides of its port — the domain through a
  test source, the adapter against files on disk.
- The session list tells `working` from `idle`; `active` and `waiting` are read
  from the reported runtime state instead of stored beside it.
- Transcripts are read from Claude Code's JSONL: messages, tool calls, and edits
  and created files as diffs, without the records Claude Code marks as its own.
- `npm start` lists the last 7 days of Claude Code sessions — the first run
  against real data.
- Runtime state comes from Claude Code's session registry. It cannot tell
  waiting for input from waiting for approval, so `RuntimeState` has a bare
  `waiting`.
- Claude Code sessions are discovered from `~/.claude/projects`: about 200 ms
  for 1546 sessions, reading only each transcript's tail.
- Search reports sessions whose transcript cannot be read instead of aborting.
- All seven QA features have a domain implementation and a test per scenario;
  the suite fails when `docs/qa.md` and the test names diverge.
- Grouping is linear: it was quadratic, 1.7 s for 40k sessions.
- Promoted from `research/noreta/` to a top-level project with vision, name
  brief, user stories, QA scenarios and implementation notes.
