# ADR-028: A run keeps its output

- **Status:** Proposed
- **Date:** 2026-10-08
- **Scope:** which bytes of a run's output are kept, where a disposable
  copy of them sits, and how a later run is given them
- **Decision type:** Architecture
- **Amends:** [ADR-001](001-agister-cli-architecture.md) rule 12: a call
  given a reference reads the output of the finished run it names
- **Relates to:** [ADR-001](001-agister-cli-architecture.md) rules 6 to
  10, [ADR-003](003-fan-out-and-join-workflow.md) rules 4 and 5,
  [ADR-026](026-the-brief-is-a-runs-input-contract.md) rules 6 and 7
- **Source:** LAB-129; LAB-126 and LAB-127
  (`research/agister/research/pre-implementation-investigation.md`); the
  owner's decisions on them, 2026-10-08: a run's output stays in the run
  that produced it, a disposable cache copy carries it to a later run,
  and the cache may hold outputs. The rules are the orchestrator's
  proposal on LAB-129, for the owner to rule on.

## Context

A completed run's output is in its record: a JSON output as a value
(`result.output`), a text output as `result.text`. The record is written
anew, indented, so the value in it is not the bytes the output check
read. Nothing keeps those bytes.

An input is kept otherwise (ADR-026 rule 6). The run keeps exactly the
bytes the agent received, with their digest. An input read from a file
also has a disposable copy, `<home>/cache/<sha256 hex>/<the file's base
name>`, which the input names under `cache_path`.

So one run's output reaches another run only through the caller, which
reads it from the record and writes it to a file. Three things go wrong:

- The output passes through the caller's context. For an orchestrating
  agent that is the context a run of its own, such as an investigation,
  was meant to spare.
- The file has no recorded origin. The consuming run records the digest
  of what it was given, and no earlier record holds that digest.
- A cache folder is named by the digest of its bytes. A JSON output
  written again from the record's value may not give the same bytes, so
  a copy made again would not be the same file.

Inside one workflow a join already receives the recorded outputs of its
fan-out nodes (ADR-003 rule 4). Between two runs that a caller starts one
after the other there is nothing. An agent cannot read a run's record
itself (ADR-001 rule 9).

## Decision drivers

- The run is the source of what it produced. The cache is disposable: no
  run may depend on a copy being there.
- A digest names bytes, so the bytes are fixed once.
- The caller passes a run's ID. It neither reads what it passes on nor
  repairs a copy.
- Nothing is found by searching runs (ADR-026 rule 6).
- What can refuse a call refuses it before its first turn (ADR-001
  rule 7).
- Evidence that cannot be written is an event, not the run's failure.
- No setting that nothing needs.

## Decision

### 1. A completed run keeps its output's bytes

A run that completes keeps its output as an artifact of the run: exactly
the bytes that passed the output check, those of the turn it completed
with. For a text output they are the text. They are written once and
never again. The run's result names the artifact, with its digest and
byte count.

The value in the record stays, for reading. It is never the source of
the bytes: a copy is made from the artifact, not by writing the record's
value again.

A workflow's run that completes keeps an output artifact of its own, as
any completed run does. Its output is the join's (ADR-003 rule 5), so
its artifact is a copy of the join's output artifact: the bytes that
passed the join's output check, with the same digest and byte count. It
is never written from the value in a record, the workflow's or the
join's. The CLI returns the workflow's run ID, and that is the ID a
caller passes on.

A run that did not complete keeps no output artifact. A record made
before this has none.

### 2. The file's name is fixed

The artifact is `artifacts/output.json` for a JSON output and
`artifacts/output.txt` for a text one. The process does not set the
name. The digest names the bytes; a name the settings choose would be a
field nothing needs.

A disposable copy sits in the cache under the same base name,
`<home>/cache/<sha256 hex>/output.json` or `output.txt`, and the result
names it as an input names its own, under `cache_path`. As with an
input's copy, the cache may be removed at any time, and the run's
artifact is then the source (ADR-026 rule 6).

### 3. A file param may name a run's output

A file param accepts a reference to a run's output: `run:<run-id>`. The
run is a call's or a workflow's (rule 1). Agister reads that run's
output artifact, checks its bytes against the recorded digest, and makes
the cache copy again if it is gone. The cache is only how the reference
is served: the caller has nothing to repair.

From there the bytes are a file input like any other: resolved once
(ADR-001 rule 8), given to the agent as its input, and kept by the
consuming run as its own copy (ADR-026 rule 6). The agent reaches
neither the run store nor the cache (ADR-001 rule 9).

The call is refused before it starts, exit 3, and the refusal is
recorded (ADR-001 rule 7), when:

- the run does not exist;
- the run did not complete;
- the run keeps no output artifact;
- the artifact's bytes do not match the recorded digest.

A plain path still works, the cache path among them, with the risk that
the copy is gone. A file whose name begins `run:` is given as
`./run:...`.

This is a further deliberate exception to ADR-001 rule 12, beside a
continuation and a join: a call reads a finished run's evidence, and
only for the run the caller names.

### 4. A reference records the run it came from

An input given by reference records the run it came from, beside its
digest. An input given by path records its digest only, even when the
path is a cache copy of a run's output: nothing is found by searching
runs (ADR-026 rule 6).

`--goal` and `--answers` are unchanged. They name the goal a run serves
and the judgement it answers, not where an input's bytes were made.

### 5. A copy that cannot be written is an event

- A cache copy that cannot be written is the event `CACHE_FAILED`, as it
  is for an input. The run goes on, and names no `cache_path` for that
  copy. A reference is still served from the artifact.
- An output artifact that cannot be written is the event
  `ARTIFACT_FAILED`. The run completes, and its output is in its record.
  A reference to that run is refused (rule 3): it keeps no output
  artifact.
- A workflow's run is treated the same way. Its copy of the join's
  artifact that cannot be written is `ARTIFACT_FAILED` in the workflow's
  run. A workflow whose join kept no output artifact has none to copy,
  and the join's run holds the event. Either way the workflow completes,
  its output is in its record, and a reference to the workflow's run is
  refused.

### 6. The digest proves the bytes, not the code

A consuming run's record shows that it received the same bytes the
producing run kept. It does not show that the code still matches what
those bytes say about it. An output that describes a repository at a
revision needs a check of its own for that, made by whoever defines the
output.

### 7. An export brings a run's output, not the run a reference names

`agister runs export` copies a run's directory, so a run's output
artifact goes with the run (ADR-026 rule 7). The run a reference names
is not brought along: it is exported by naming it, as a run that `links`
names is. The consuming run's export still holds the bytes it received,
as its own copy.

### 8. Left out

The output artifact, its cache copy and the reference are built in
LAB-130, for a call's run and for a workflow's: it covers how a
workflow's run ends, where the join's artifact is copied (rule 1). That
change alters what the CLI and a run's record offer, so it is done only
when these say the same as the binary (`agister/AGENTS.md`):

- the caller skill, `agister/skills/agister/SKILL.md`;
- `agister/README.md`;
- the settings diagrams, `agister/docs/settings-architecture/`;
- the Pages view, `agister/pages/`, with its tests.

The names of the record's other new fields are LAB-130's.

## Consequences

- One run's output reaches another without passing through the caller.
  An orchestrating agent hands on a run's ID and spends no context on
  what the run produced.
- A workflow's output is passed on by the run ID the CLI returned for
  the workflow. The caller does not read the workflow's record to find
  the join's run.
- The record says where an input came from, when it was given by
  reference. A caller that passes a path gives that up.
- A cleared cache breaks no reference. It still breaks a call that was
  given a cache path.
- A run's output is stored more than once: as a value in the record, as
  the artifact, and as a copy in each run that receives it. A workflow's
  output is kept by two runs, the join's and the workflow's. The cache
  copy is a further one, and disposable.
- A reference depends on the producing run being in the run store. A run
  removed from the host, or exported and not kept, can no longer be
  named: the consuming runs keep their copies, and a new call needs a
  path.
- A run whose output artifact failed completes and cannot be referred
  to. Its output is still read from its record.
- Runs made before this keep no output artifact, so a reference to one
  is refused.
- Calls depend on one another in one more way (ADR-001 rule 12): by
  name, on a finished run, and checked at the entry.

## Alternatives considered

- **The caller reads the output and writes it to a file** (today):
  rejected; the output fills the caller's context, and the file has no
  recorded origin.
- **Pass the cache path and nothing else:** rejected; the cache is
  disposable, and a call given a path whose copy is gone fails.
- **A command that makes the cache copy again from the run:** rejected;
  it leaves the caller a repair step, taken only after a call has
  failed.
- **Make the copy again from the record's value:** rejected; a value
  written again may not give the same bytes, and then not the same
  digest.
- **The cache as the only copy:** rejected; the run is the source, and
  the cache may be removed at any time.
- **A workflow's run keeps no artifact, and a reference names its join's
  run:** rejected; the CLI returns the workflow's run ID, so the caller
  would read the workflow's record to find the join's run, and a
  reference by the ID it was given would be refused.
- **A name the process sets:** rejected; the digest names the bytes, and
  the name would be a settings field nothing needs.
- **Find the producing run by the digest of a path's bytes:** rejected;
  nothing is found by searching runs (ADR-026 rule 6).
- **A flag beside `--goal` and `--answers`:** rejected; those say what a
  whole run is for, and a reference says where one input's bytes came
  from.
- **A copy that cannot be written fails the run:** rejected; the output
  is valid and in the record, and an input's copy is treated the same
  way.
