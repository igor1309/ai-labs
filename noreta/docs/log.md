# Log

## 2026-09-16
- A session resumed under a second project directory is reported once, described by its newest transcript.
- `exactOptionalPropertyTypes` on for noreta: an unknown repository is an absent key, never `undefined`.
- `main.ts` only reads the machine and prints; wiring lives in `composition-root.ts`, now under test.
- Each module declares the shapes it consumes; only composition modules import another module's types.
- Grouping keys limited to values compared by value, so equal repositories never split into two groups.
- Comments kept only where they explain this code at the point it is edited; 232 lines cut that restated code, tests or docs.
- A test fails the build when a comment restates a claim the tests already carry, so the cut holds.
- Waiting for input and waiting for approval merged into one scenario per feature: both show as `waiting`.
- Background task notifications dropped from transcripts, told apart by `origin.kind`.
- A workspace's repository is kept in `~/.noreta/workspace-repositories.sqlite` while the workspace is on disk, so a deleted worktree still names it.
- Remembering never changes what the listing shows: a write the memory refuses is dropped, and the repository read from disk still shows.

## 2026-09-15
- Repository read from git's layout; a deleted worktree names none.
- Runtime state read on every source read, so sessions starting or stopping mid-run are seen.
- Every QA scenario covered on both sides of its port.
- Session list tells `working` from `idle`; `active` and `waiting` derive from runtime state.
- Transcripts read from Claude Code's JSONL: messages, tool calls, edits and new files as diffs.
- `npm start` lists the last 7 days of sessions — first run against real data.
- Runtime state from Claude Code's registry; it cannot tell input from approval, so `RuntimeState` has a bare `waiting`.
- Sessions discovered from `~/.claude/projects`: 200 ms for 1546, reading only each transcript's tail.
- Search reports unreadable transcripts instead of aborting.
- All seven QA features implemented and tested; the suite fails when `docs/qa.md` and test names diverge.
- Grouping is linear; was quadratic, 1.7 s for 40k sessions.
- Promoted from `research/noreta/` to a top-level project.
