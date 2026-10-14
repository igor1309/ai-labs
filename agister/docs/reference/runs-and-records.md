# Runs and records

[Reference](README.md) · [Agister](../../README.md)

## Staleness and recovery

A process may set staleness limits under `stale`, none above its
`timeout`: `no_event`, `tool_command` and `repeated_tool_calls` for an
agent turn, `no_output` for a verification run. A call that reaches one
ends before its timeout, and its record names the limit and what went
stale, unless the settings give it resumes to recover with
([ADR-024](../adr/024-a-stale-call-is-resumed-once.md)):
`stale.recover.max_resumes`, which the process sets, and
`stale.recover.instruction`, which a budget above 0 needs. Unset, the budget is 0, and every limit ends the call. With a
budget, an agent turn that Agister ended at a limit is followed by a
recovery turn: the call's session is resumed, in the same worktree, with
the instruction and the evidence of what went stale. Each recovery turn
spends one resume. The same limit reached again on the same thing ends
the call with that limit's status and class, even with resumes left, and
so does any limit once none is left. A process with a budget
must be `resumable`, a call with one is refused before its first turn
unless its agent's runtime can resume a session, and `process show`
prints the budget (`recovery resumes N`).

A verification run ended at `no_output` is a failed attempt, whatever
`stale.recover` says: a repair turn follows it as it follows a failing
run, while an attempt is left of `verify.max_attempts`. With one attempt,
the call ends as interrupted, as before.

The run's record lists its recovery turns under `recoveries`, each with
its `number`, the turn it `follows` and what went `stale` there, the
digest of the message, the session it `resumed` and the one it reported,
its usage, cost and timing, and its `outcome`: `completed`, `same_limit`,
`different_limit` or `failed`, with the `error`. The events are
`RECOVERY_STARTED`, `RECOVERY_FINISHED` and, with the reason,
`RECOVERY_NOT_STARTED`; a repeated call's `STALE` event carries the last
`result` the runtime reported for it, if any.

## Tool trail

The run's record holds what the runtime reported the agent did on the way
under `trail`, over every turn of the call, the repair and recovery turns
too: `touched`, the paths its tool calls wrote, in order, each with the
`tool` of its first write and kept once, and `denied`, each tool call the
runtime refused for want of a permission, with its `tool` and bounded
`input`. The events are `TOUCHED`, one per path a tool call writes, with
the `path`, the `tool` and the call's `tool_use_id`, recorded when the
call starts, and `PERMISSION_DENIED`, one per denial, with the `tool` and
the `input`; `runs watch` prints a line for each. A path is as the runtime
gave it: Agister neither resolves nor judges it, and blocks nothing by
it. The trail is evidence of what the agent reached for, where the patch
is what the call left: a turn that a staleness limit ended, or that was
killed, keeps what it reported before it ended. Claude Code reports the
paths of its `Edit`, `Write`, `MultiEdit` and `NotebookEdit` calls, and
its denials; Codex the paths of its file changes, and no denial, for its
stream has none. A file a shell command wrote is not among them. OpenCode
and Pi report neither, and a record with nothing reported has no `trail`.

## Inputs and working copies

The run's record lists the `inputs` it was given, each with its
`identity`: a commit, a digest, or a short literal itself. A text value
of up to 2000 bytes is in the record as its `value`. A longer one is kept
with the run, beside `changes.patch`, as
`~/.agister/runs/<id>/artifacts/input-<name>.txt`, exactly the bytes the
agent received; an input whose name another input shares, in any case,
or holds anything but letters, digits, `-` and `_`, or runs over 64
characters, is kept as `input.<n>.txt` instead, `<n>` its place among
the record's `inputs`, from 0. The input names it under `artifact`, with
its `digest` and `bytes`; a long literal, such as the goal a workflow
passes to each node as a param, is recorded by its `sha256:` digest, as
its `identity` and, once an input's artifact keeps its text, in the
request's `params`; a run refused before that keeps the param's text
there. An input's text that could not be kept is recorded as the event
`ARTIFACT_FAILED`, and the input keeps its identity only. A record made before inputs were kept has no
`artifact`.

An input read from a file also has a disposable working copy,
`~/.agister/cache/<sha256 hex>/<the file's base name>`, which the input
names under `cache_path`. The folder is named by the bytes' digest, so a
copy is never overwritten with other bytes, and one that already holds
them is left as it is; a later run given that path reads the same bytes
and records the same digest. The cache may be removed at any time: the
run's own copy is the source. A copy that could not be written is the
event `CACHE_FAILED`; the input has no `cache_path`, and the run goes on.

## Goals and judgements

A run names the goal it serves and the judgement it answers; nothing is
found by searching runs
([ADR-026](../adr/026-the-brief-is-a-runs-input-contract.md) rules 2
and 6). `--goal <run-id>[:<input>]` records `links.goal`: that run's input, `goal` when
none is named, by its `run`, `input` and `digest`, with the `artifact`
that keeps its bytes when there is one, all read from that run's record.
`--answers <run-id>` records `links.judgement`, that run's `run`. A call
is refused before it starts when the goal's run does not exist, has no
such input or keeps its bytes nowhere, neither inline nor as an artifact,
and when the judgement's run does not exist or did not complete. Both
are optional, for any workflow; a run given neither has no `links`.

## Export

The run store is one host's, so runs, the briefs and goals they keep
among them, are exported for audit
([ADR-026](../adr/026-the-brief-is-a-runs-input-contract.md) rule 7):
`agister runs export <run-id>... --to <dir>` copies each run's directory
byte for byte to `<dir>/<run-id>/`, its owner lock aside, and a workflow
run brings its nodes' runs; the runs its `links` name are exported by
name. It is refused, exit 3, before it writes anything when `--to` is
missing, not a directory or in the run store, under any name, or a run
does not exist or is still running, or a process is recovering what a
finished run left. Each run is held against its writers, its owner and
recovery, until it is copied.
A copy is renamed into place only once complete and its artifacts read
back with the recorded digests; one that does not match fails, exit 1.
An identical copy already there is kept; one that differs is never
overwritten, and that run is refused, naming the file. An interrupted
export reports the runs it exported and exits 2.

## Permission warnings

A call's `plan.declared` holds its effective permissions, `plan.granted`
the selected primitives' grants, and `plan.extra` grants beyond declared.
`plan.warnings` persists extra grants and missing runtime version evidence
before runtime startup. `result.warnings` includes them in finished,
abandoned and reaped outcomes. As workflow nodes finish, the parent persists
their warnings with node names in `workflow.warnings`; its finished,
abandoned and reaped results include the warnings accumulated so far.
Printed results show them even with `--quiet`. Warnings do not change the
status or exit code. See [permissions and runtimes](permissions-and-runtimes.md).
