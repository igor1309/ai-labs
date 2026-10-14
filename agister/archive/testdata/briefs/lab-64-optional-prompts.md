# A prompt input may be optional (LAB-64, ADR-019)

Implement [ADR-019](../../docs/adr/019-a-prompt-may-be-optional.md) as
written. It amends ADR-014 rule 4 and nothing else.

## Wanted

- `{source: prompt, name: <name>, optional: true}` parses. `optional`
  takes only `true`. Any other value, or any other extra argument, is a
  problem of the input, as today (`promptArgs` in
  `internal/domain/definition/prompts.go`).
- Resolution (`internal/app/resolve.go`): an optional prompt that neither
  layer has is not a refusal. A broken one (it exists but cannot be read)
  still refuses, as today. A present one resolves and is recorded exactly
  as a required one.
- Inputs (`internal/app/calls.go`, around the `PromptSource` branch): a
  missing optional prompt gives no `run.Input`, so the agent's message has
  no section for it and no empty text.
- Record: the call's record lists each optional prompt not found, by
  input and name (rule 3). Choose the smallest field on `run.Record` that
  says it, and show it where a record's definitions are shown.
- `check` (`internal/domain/settings/settings.go`, the ADR-014 rule 4
  check): a missing optional prompt is not a problem. Another input that
  refers to an optional prompt's value (`${value.<name>}`) is a problem of
  the process (rule 5).
- `process show` and `check --tree` mark the input as optional and say
  whether its prompt was found (`internal/cli/cli.go`, near
  `view.Prompts`).
- README: where `{source: prompt, …}` is described, add one sentence on
  `optional: true` with a link to ADR-019.

## Tests

ADR-017 applies. Use seams, not real machinery. Mark a test `Contract
test:` only if its claim is about a real thing. Each test starts with
`t.Parallel()` or has a `Serial:` reason. Prove:

- that a missing optional prompt runs the call without the input and
  records it as absent;
- that a present optional prompt is given and recorded as a required one;
- that a missing required prompt is still a `check` problem and a refusal;
- that a broken optional prompt still refuses;
- that `optional: false`, or a value that is not `true`, is a problem;
- that referring to an optional prompt from another input is a `check`
  problem;
- that `process show` shows the input as optional, both when its prompt
  is found and when it is missing.

Put them beside the existing ADR-014 tests (`*prompts_test.go`).

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.

List every file you changed.
