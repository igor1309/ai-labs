# AGENTS (agister)

Agister is developed by dogfooding: its own implementation and review run
through Agister, from the repository root. These rules replace the root
`AGENTS.md`'s implementation and review steps; its verification rules
still apply.

- Implement through the `implement` process: commit the candidate, write
  the brief to a file, run
  `agister run implement --param candidate=<rev> --param brief=<file>`, and
  apply the run's `changes.patch`. Send review fixes as a continuation of
  that run (`--continue <run>`), so the implementer keeps its session.
- Verify the result yourself as the root `AGENTS.md` says: red then green,
  `scripts/handoff-check.py`, the tests. No mutation or revert checks.
- Review through Agister, on a committed candidate: a `*_review_codex`
  process for code, or `decision_review_codex --param prompt=<prompt file>`
  for decision documents (agent `codex-sol`: `gpt-6.1-sol`, effort high).
  Reviewers collect the evidence; the `review_judge` process rules on it
  and never reads the code. Bundle the review runs with
  `scripts/review-bundle.py <run-id>... > <file>` and run
  `agister run review_judge --param reviews=<file>`; pass it nothing else.
  Act on the rulings as written, without judging them again: fix items go
  to the implementer as a continuation, owner items to the owner, defer
  items to `agister/docs/deferred.md`. Rejections for missing evidence are
  feedback on the reviewers' prompts, not the judge's.
- At most 2 review rounds. Deferred work is `agister/docs/deferred.md`:
  gap, trigger, done when, for real, observed gaps only.
- ADRs reference only earlier ADRs.
- A failure of Agister itself during this work is a finding about Agister:
  record it and fix it; do not route around it. A Claude Code subagent or
  `codex exec` is a fallback only when Agister cannot run the step; say
  why.
