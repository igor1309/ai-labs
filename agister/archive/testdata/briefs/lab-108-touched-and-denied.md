# LAB-108: record touched paths and permission denials as turn evidence

## Gap

A turn's record says what the patch holds at the end, not what the agent
touched or was refused on the way. A killed or stale turn, and a reviewer
judging drift, have no trail of the paths written or the permissions
denied. Today the Claude Code adapter keeps only the number of
`permission_denials`, and no adapter reports the path a tool wrote.

## Scope

Observation only, from the streams Agister already reads. No policy
change, no blocking, no new setting, no status or class.

1. **Touched paths.** Each adapter that can reports, through its own
   contract, the path a tool call writes, when the call starts:
   - Claude Code: `Edit`, `Write` (and `MultiEdit`, `NotebookEdit` where
     the stream names them) by the input's `file_path` (`notebook_path`);
   - Codex: a `file_change` item, each of its changes' paths.

   The core knows no runtime's format (ADR-001): the adapter says "this
   call writes these paths" in the core's own terms, as `ToolCall`
   already says `Command`. OpenCode and Pi are unchanged.
2. **Permission denials.** The Claude Code adapter reports each entry of
   the result's `permission_denials` (the tool, and its input bounded as
   tool inputs already are), not only their number. The existing count
   keeps its meaning. Codex's stream has none: say so in a comment where
   the adapter would report them.
3. **Events.** The core records, in the run's events, in stream order:
   - `TOUCHED`, one per path, with the path, the tool and the tool call's
     ID;
   - `PERMISSION_DENIED`, one per denial, with the tool and the bounded
     input.

   A path is recorded as the runtime gave it; the core does not resolve
   or judge it. A turn that a staleness limit ended, or that was killed,
   keeps the events recorded before it ended.
4. **`agister runs show` includes them.** The run's record gains the
   trail, so that `runs show` prints it: the touched paths in order (each
   with its tool, repeated writes of one path kept once, at its first
   write) and the denials. Follow how the record holds a call's other
   evidence (`recoveries`, a turn's `stale`); pick the place that fits
   and say which. `agister runs watch` prints the two events in a line
   each, as it prints the other events it knows.

## Done when

- Fixture tests per adapter (Claude Code, Codex) show the paths, and for
  Claude Code the denials, reported in order.
- A test through the application layer shows the events recorded and the
  record holding the trail for a completed turn and for a turn a
  staleness limit ended.
- `README.md` and the caller skill `skills/agister/SKILL.md` say what
  the record and the events now hold, where they describe a run's
  record. These are this change's done gates (`agister/AGENTS.md`); the
  settings diagrams and Pages are untouched, since no setting changes.

## Constraints

- Regular committed tests only: fakes, fixtures, `t.TempDir()`. No
  mutation or revert checks.
- Match the surrounding code: its comment density, names and idiom.
- ADRs are not edited.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
