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
  details only for failures): `go test -count=1 -timeout 1m ./<pkg>/...` for what you
  touched, `-run <Test>` to narrow; the full check is
  `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... &&
  go test -race -count=1 -timeout 1m ./internal/app/...` (about 30 s), and, for
  the `gokit` module Agister requires (ADR-019), from `gokit/`:
  `test -z "$(gofmt -l .)" && go vet ./... && go test -race -count=1 -timeout 1m ./...`.
- Verify the result yourself as the root `AGENTS.md` says:
  `scripts/handoff-check.py`, then the tests. No mutation or revert checks.
- Review a committed candidate with
  `agister run code_review --param base=<rev> --param candidate=<rev> --param goal=<file>`;
  the goal is the file that says what the change is for, its issue or
  brief, and a call without it is refused (ADR-023). Act on
  the rulings as written, without judging them again: fix items go to a
  fresh `implement` run, owner items to the advisor (below), defer items to a
  backlog issue in the Multica project Agister. Waive items get no repair and
  no backlog issue; list them in the pull request description with their
  switching condition. Rejections for missing evidence are feedback on the
  reviewers' prompts, not the judge's.
- For an owner item, write the question file: who asked (the workflow run
  and item), the question and the options (the item's `action`, unedited),
  nothing else. Commit what the question is about and run
  `agister run advisor --param question=<file> --param revision=<rev>`.
  Append its decision to `agister/docs/decisions.md` as a record, unedited,
  with status `Provisional (advisor)` and the run ID, and list the
  provisional records in the pull request description. Only an `owner`
  answer goes to the owner.
- Review a change that adds or edits an ADR with
  `agister run adr_review --param base=<rev> --param candidate=<rev> --param goal=<file>`,
  before the code that follows it; its rulings are acted on the same way.
- At most 3 review rounds. Deferred work is a backlog issue in the
  Multica project Agister: gap, trigger, done when, for real, observed
  gaps only.
- A change to what the CLI or the settings offer, such as a command, a
  flag, a settings field or a behaviour a caller relies on, is done only
  when these say the same as the binary:
  - the caller skill, `skills/agister/SKILL.md`;
  - `README.md`, with any new ADR in its list;
  - the settings diagrams, `docs/settings-architecture/`;
  - the Pages settings view, `pages/`, with its tests.

  Its issue names these as done gates.
- ADRs reference only earlier ADRs.
- A failure of Agister itself during this work is a finding about Agister:
  record it and fix it; do not route around it. A Claude Code subagent or
  `codex exec` is a fallback only when Agister cannot run the step; say
  why.

## Decision records

`agister/docs/decisions.md` holds the advisor's decisions on open build
questions (ADR-007) and the owner's overrides; the first record creates
it, under the heading `# Decisions`. Each record is appended:

```markdown
## D-<n>: <the question, in a line>

- **Status:** Provisional (advisor) | Confirmed | Owner
- **Supersedes:** D-<m> (only on a record that replaces an earlier one)
- **Asked by:** <who asked; for a judge's item, its workflow run and item>
- **Question:** <the question>
- **Options:** <the options>
- **Excluded:** <each option not chosen, and why>
- **Decision:** <the option chosen>
- **Rests on:** <the recorded decisions it rests on, or "none">
- **Follow-ups:** <what is left to do; one that changes code names the
  test that proves it>
- **Advisor run:** <run ID> (not on an owner's record)
```

- A record is the advisor's output, unedited, numbered from D-1 in the
  order appended. The output is one property, `advice`, of `kind`
  `decision` or `owner`: a decision's other fields are the record's
  (`asked_by`, `question`, `options`, `chosen` for **Decision**,
  `excluded`, `rests_on`, `follow_ups`); an `owner` answer has only its
  `reason`.
- Its status is `Provisional (advisor)` until the owner rules. The owner
  confirms it by setting the status to `Confirmed`.
- Records are not edited otherwise. A later decision on the same question
  is a new record that names the one it supersedes; the earlier record
  gains only the line `- **Superseded by:** D-<n>`.
- The owner overrides with a superseding record whose status is `Owner`.
  An owner's record is superseded only by the owner.
- An `owner` answer leaves no record.
