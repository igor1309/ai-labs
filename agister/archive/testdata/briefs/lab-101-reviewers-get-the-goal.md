# Reviewers know the goal (LAB-101, ADR-023)

## Decision

Implement accepted ADR-023, `agister/docs/adr/023-reviewers-know-the-goal.md`.
Read it first; it is the spec. Also read ADR-003 rules 2 and 4 and
ADR-020 rules 1 to 4.

## Wanted

Settings, prompts and schemas only; no Go product code (ADR-023 drivers).

- Both review workflows (`.agister/workflows/code_review.yaml`,
  `adr_review.yaml`) take a required `goal` param: a file path, resolved
  once, which every review node receives as an input (ADR-003 rule 2).
  Find out from the code how a workflow's resolved values reach its
  fan-out nodes and follow that. The join (`review_judge`) does not
  receive it (ADR-003 rule 4). A call without `goal` is refused.
- Every review process (`.agister/processes/*_review_codex.yaml`) takes the
  goal as a file input, and its instruction says what it is: what the
  change is for; its claims are checked, its scope exclusions are the
  owner's (ADR-023 rule 2).
- `.agister/schemas/review-result.json`: `evidence.introduced_by_change`
  is replaced by required `evidence.scope`, enum `change`, `goal`,
  `outside`, each described as in ADR-023 rule 3.
- The five review prompts (`prompts/code-review-architecture.md`,
  `-tests.md`, `-adversarial.md`, `-clarity.md`, and the ADR review
  prompt the `adr_review_codex` process uses): look also for what stops
  the goal, within ADR-023 rule 3's bounds (a concrete scenario the goal
  requires, a trace, the goal's condition quoted with its qualifications
  and where it stands). The tests prompt: a missing test the goal needs,
  with the specific goal behaviour the existing assertions let break.
  Where a prompt now stops at the changed paths
  (e.g. `code-review-adversarial.md` around line 43), say the goal widens
  that. Keep each prompt's existing style; edit, do not rewrite.
- The judge prompt `prompts/code-review-judge.md` and
  `.agister/schemas/judgement.json` descriptions: ADR-023 rule 4. `goal`
  ruled like `change`; `outside` is `defer`; a `goal` finding that a scope
  exclusion bars is `owner`; an unsupported scope classification is
  rejected; an older collection's `introduced_by_change` true reads as
  `change`, false as `outside`. Bump the judge prompt's version line if it
  has one.
- Update every run line and doc that shows how to call `code_review` or
  `adr_review` (workflow header comments, `agister/AGENTS.md`) to pass
  `--param goal=<file>`. Leave `agister/testdata/briefs/` history alone.
- `agister/cmd/agister/repo_settings_test.go` uses `introduced_by_change`
  in a fixture: update it to `scope`, and add a normal test there (same
  style as its neighbours) that the repository's settings refuse a
  `code_review` call without `goal`, and that the review nodes receive
  `goal` while the judge does not, if the existing tests' seams allow
  it. If a behaviour cannot be asserted with the existing seams, say so;
  do not plant files by hand and do not do mutation checks.

## Check

From the repository root: `agister check` exits 0. From `agister/`:
`test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 ./...`.

List every file you changed.
