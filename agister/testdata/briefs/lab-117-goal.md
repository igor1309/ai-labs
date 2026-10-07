# LAB-117: keep inputs' words in the run's evidence

## Intent

A run's record must be enough to read every input the run was given,
whatever its length (ADR-001 rule 10: "Anything needed to understand a
call is evidence"; ADR-026 rule 6: the run keeps the durable copy of the
bytes it was given, with their digest). Today it is not:

- `summarize` (`agister/internal/app/calls.go`) drops an input's value from
  the record when it is a string over `inlineInputChars` (2000). A `file`
  input keeps only its `sha256:` identity, so implement run
  `20261007T054525Z-566bc6` holds no text of its brief, and workflow
  `20261007T053330Z-5121d0` holds only the digest of a goal under `/tmp`
  that will not outlive the host.
- A workflow passes its resolved values to each fan-out node as params
  (`passedValues`, `agister/internal/app/workflow.go`). A `param` input
  takes the literal as its identity (`agister/internal/adapters/inputs/inputs.go`),
  so every review node's record holds the whole goal text twice, in
  `request.params` and in the input's `identity`.

## Done when

1. Every input whose value the record leaves out (a string over
   `inlineInputChars`) is stored as an artifact of that run, beside
   `changes.patch`, with its digest and size; the record's input names
   that artifact. This holds for a process run's inputs and for a
   workflow run's inputs, whatever the source kind (`file`, `param`,
   `prompt`, `workflow.collection`). A value within the limit stays inline,
   as today. The stored bytes are exactly the value the agent received.
2. A long value's identity in the record is its `sha256:` digest, never the
   literal: a `param` input over the limit, as a node of a workflow
   receives the goal, records the digest as its identity and in the
   recorded `request.params`, and its bytes in the artifact. The value the
   call works with is unchanged; only what the record holds changes.
   Except on a refusal (owner, 2026-10-07): a long param stays its literal
   in the recorded `request.params` until an input's artifact keeps its
   bytes, and a run refused before that keeps the literal, so its text is
   never lost.
3. A record written before this change still reads (`runs show`, Pages,
   the hold that reads `changes.patch`): the new input field is optional.
4. `agister runs show` names an input's artifact, so a reader can find the
   text.
5. Regular tests prove 1 to 4 with the existing seams (the recorder and
   runs spies in `internal/app`), including: a file input over the limit
   ends up as an artifact with its digest; a workflow node's long param
   is recorded as a digest with its artifact; a short input stays inline
   with no artifact; an artifact that fails to be stored is reported as
   `changes.patch` failures are (`ARTIFACT_FAILED`), not silently lost.
6. The done gates say the same as the binary where they describe what a
   record holds about inputs: the caller skill
   (`agister/skills/agister/SKILL.md`), `agister/README.md`,
   `agister/docs/settings-architecture/` and `agister/pages/` with its
   tests. Change them only where they describe this; say in the notes
   which ones needed no change and why.

## Out of scope

- The working copy under `~/.agister/cache/` and links between runs
  (LAB-118); templates and the entry check (LAB-119); the export of runs
  (LAB-121).
- No change to what a process or workflow takes, to settings, or to the
  values an agent receives.
- Stopping the commit of briefs to `agister/testdata/briefs/`: a later
  decision, after this lands.

## Sources

- Multica LAB-117.
- `agister/docs/adr/026-the-brief-is-a-runs-input-contract.md` rules 6 and
  10; `agister/docs/adr/001-agister-cli-architecture.md` rules 8 and 10.
- `research/agister/research/brief.md` §1 (the observed runs).

## Decisions

- 2026-10-07, owner: briefs and goals belong to the run, not the
  repository (ADR-026).
- 2026-10-07, owner, on LAB-117 question 1 (judge of `code_review` run
  `20261007T084631Z-5dedb2`; the advisor, run `20261007T085707Z-689810`,
  answered `owner`): option (a). Delay redacting `request.params` until
  matching evidence is kept, and keep the original request on refusal
  paths. Test: a long goal param followed by a failing file input.

## Open

None.
