# Log

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
