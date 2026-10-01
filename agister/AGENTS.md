# AGENTS (agister)

Agister is developed by dogfooding: its own implementation and review run
through Agister, from the repository root. These rules replace the root
`AGENTS.md`'s implementation and review steps; its verification rules
still apply.

- Implement through the `implement` process: commit the candidate, write
  the brief to a file, run
  `agister run implement --param candidate=<rev> --param brief=<file>`, and
  apply the run's `changes.patch`. Review fixes go to a fresh `implement`
  run with their own brief; only a failing verify goes back to the same
  session, which Agister does itself.
- Test commands, from `agister/`, quiet (never `-v`: one line per package,
  details only for failures): `go test -count=1 ./<pkg>/...` for what you
  touched, `-run <Test>` to narrow; the full check is
  `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 ./... &&
  go test -race -count=1 ./internal/app/...` (about 30 s).
- Verify the result yourself as the root `AGENTS.md` says:
  `scripts/handoff-check.py`, then the tests. No mutation or revert checks.
- Review a committed candidate with
  `agister run code_review --param base=<rev> --param candidate=<rev>`. Act on
  the rulings as written, without judging them again: fix items go to a
  fresh `implement` run, owner items to the advisor (below), defer items to
  `agister/docs/deferred.md`. Rejections for missing evidence are feedback
  on the reviewers' prompts, not the judge's.
- For an owner item, write the question file: who asked (the workflow run
  and item), the question and the options (the item's `action`, unedited),
  nothing else. Commit what the question is about and run
  `agister run advisor --param question=<file> --param revision=<rev>`.
  Append its decision to `agister/docs/decisions.md` as a record, unedited,
  with status `Provisional (advisor)` and the run ID, and list the
  provisional records in the pull request description. Only an `owner`
  answer goes to the owner.
- Review a change that adds or edits an ADR with
  `agister run adr_review --param base=<rev> --param candidate=<rev>`,
  before the code that follows it; its rulings are acted on the same way.
- At most 2 review rounds. Deferred work is `agister/docs/deferred.md`:
  gap, trigger, done when, for real, observed gaps only.
- ADRs reference only earlier ADRs.
- A failure of Agister itself during this work is a finding about Agister:
  record it and fix it; do not route around it. A Claude Code subagent or
  `codex exec` is a fallback only when Agister cannot run the step; say
  why.
