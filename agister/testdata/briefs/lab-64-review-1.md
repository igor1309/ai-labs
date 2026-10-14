# LAB-64 review round 1: absence of an optional prompt is a real not-found

Candidate: the branch head. ADR-019 is implemented; code_review
`20261003T130421Z-aa12ef` found that absence is inferred wrongly. The
owner decided (D-11 in `docs/decisions.md`, option b): resolution carries,
per input, a distinguishable not-found result from the read path. Only a
genuine not-found in both layers omits the input.

## Fix

- Replace the inference "not in the prompt listing" plus the map keyed by
  input name (`internal/app/resolve.go` around line 340, `calls.go` around
  line 1549, `run.Record.AbsentPrompts`). Resolution asks the settings for
  the prompt and gets back found, not found, or an error. Only not found
  in both layers makes an optional input absent. Anything else that fails
  refuses the call as a broken document (ADR-019 rule 1).
- Absence belongs to the input, not to its name: an absent optional input
  never drops another input, even one with the same name.
- Keep the record saying which optional prompts were absent (rule 3).
  Reshape the field if you need to.
- `check` must agree: a directory, or anything else at the prompt's path
  that exists but cannot be read, is a problem of the process, not "not
  found".

## Tests (regular, deterministic, ADR-017)

1. A directory at `.agister/prompts/<name>.md` under `t.TempDir()`, with
   the prompt optional and no home prompt. `check` reports the broken
   prompt, the call refuses before any agent turn, and no absent-prompt
   record is written.
2. Two `input.values` entries with the same name: an optional prompt that
   is absent, and a required one that is present. The required prompt's
   text reaches the agent's message.
3. A prompt-listing or read error for an optional prompt, injected through
   the existing `failingSource` seam (`listErr` / `readErr` in
   `internal/app`). The failure is recorded, there is no absent entry, and
   the runtime is never invoked.

Do not add a rule that input names must be unique.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
