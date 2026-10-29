# Run state and the event log: how other tools keep them consistent

How open-source agent orchestrators record what a run is doing now and
what happened to it, and how each keeps the two in step. Collected on
2026-10-29 for Multica LAB-690 (live run state and `agister status`).
SQLite was ruled out for Agister before this research.

## The question

Agister keeps each run in its own folder: `record.json`, rewritten whole
through a temporary file and a rename, and `events.jsonl`, append-only.
Exactly one process writes a run: its own agister process. Today a record
in flight reads `lost`, with no process id and no heartbeat, so running,
waiting and dead look the same.

The working proposal: one lifecycle source feeding two writers, a state
writer for the record and an event writer for the log, with neither derived
from the other. The open concern: the record and the log can disagree,
for example when a crash lands between the two writes.

## What others do

**T3 Code** (`pingdotgg/t3code`, `apps/server/src/orchestration-v2/`).
Event sourcing. Events are the truth, stored in SQLite with a sequence
number. Projections (read models) record the `last_sequence` they applied.
`ProjectionMaintenance.ts` compares that with the newest event, and can
rebuild a projection by replaying events. A disagreement is detectable and
repairable by construction.

**Paseo** (`getpaseo/paseo`, `docs/agent-lifecycle.md`). A daemon owns
every agent. A live agent carries `lastStatus` (`initializing`, `idle`,
`running`, `error`); each change is saved to disk and streamed to clients
over WebSocket. State is the truth; the stream is a notification. The doc
names the liveness gap: between turns nothing watches the provider
process, so an agent whose runtime died "sits at `idle` looking healthy".
The fix is to report that exit as a failure, landing the agent in `error`.
Crash recovery is stated as best effort, with no exactly-once guarantee.

**Composio Agent Orchestrator** (`ComposioHQ/agent-orchestrator`). No
database: flat metadata files per session (status, activity, branch, PR,
runtime handle, timestamps) plus JSONL event logs. The same two-file shape
as Agister.

**Orca.** The name covers several unrelated projects. `orca-cli/orca`
(Go) keeps run state in SQLite. `onorca.dev` shows a status per session:
working, waiting on you, blocked or failed, idle. That is the set of
answers a caller wants from `agister status`.

## Findings

1. Every tool shown picks one source of truth. None keeps two independent
   truths side by side.
2. Where both a snapshot and a log exist, the snapshot carries a cursor
   into the log (T3 Code's `last_sequence`). That makes "the record and
   the log disagree" a check a reader can run, not a silent state.
3. Liveness needs an owner. A status written by the process that died is
   stale by definition; Paseo has its daemon report the exit. Agister has
   no daemon, so the reader must judge liveness (process id plus
   heartbeat age).
4. Agister's file layout matches common practice for tools without a
   database. The weakness is what the files say, not their format.

## Sources

- [T3 Code event sourcing (DeepWiki)](https://deepwiki.com/pingdotgg/t3code/2.4-event-sourcing-architecture)
- [T3 Code services (Mintlify)](https://www.mintlify.com/pingdotgg/t3code/api/server/services)
- [T3 Code encyclopedia](https://raw.githubusercontent.com/pingdotgg/t3code/main/docs/reference/encyclopedia.md)
- [Paseo agent lifecycle](https://github.com/getpaseo/paseo/blob/main/docs/agent-lifecycle.md)
- [Composio Agent Orchestrator architecture](https://www.mintlify.com/ComposioHQ/agent-orchestrator/concepts/architecture)
- [orca-cli/orca](https://github.com/orca-cli/orca)
- [Orca agents and sessions](https://www.onorca.dev/docs/model/agents-sessions)
