# LAB-64 review round 2: two edges of optional prompts

Candidate: the branch head. Review round 2 (`codex exec` fallback,
because Agister's codex mapping verifies no primitive for codex 0.160.0)
found two defects against ADR-019 and D-11. Fix both. Do not ban
duplicate input names.

## 1. A dangling symlink is not "not found"

Case: `.agister/prompts` is a dangling symlink, or so is
`.agister/prompts/<name>.md`. Home has no such prompt, and the process
names it as optional. Today the call goes ahead without the input:
`fsdefs.go` turns the failed listing's ENOENT into an empty listing
(around 169–171) and the failed read into `ErrNotFound` (around 115–126).
It checks dangling links only for blocks.

Wanted: a dangling symlink at the prompts folder or at the prompt's file
is an error, not `ErrNotFound`. So `check` reports it, and the call
refuses with no absent entry. A plain missing folder or file stays not
found. Keep the existing handling for blocks.

Test: regular, under `t.TempDir()`, for both cases (folder link and file
link). Assert that `check` reports it, that the call refuses before the
runtime is reached, and that no absent prompt is recorded. Put it beside
the existing directory test (`TestADirectoryAtAnOptionalPromptsPathRefusesTheCall`)
or in `fsdefs` tests at the adapter level, plus one app-level assertion.

## 2. Duplicate names get past rule 5

Case: a required prompt input `rules`, then an optional prompt input
`rules`, then an input that uses `${value.rules}`. It passes check.
`optionalValue` (`documents.go` around 584) looks only at the first input
named `rules`, but at run time the later, optional prompt supplies the
text (`calls.go` around 1568).

Wanted: a reference to a name is a problem of the process if any input of
that name declared before the reference is an optional prompt. Test
parsing and check with duplicate names in both orders, plus the unique-name
case that already passes.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
