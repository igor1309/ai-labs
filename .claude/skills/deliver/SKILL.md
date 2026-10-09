---
name: deliver
description: For the session that delivers a change by delegating its implementation and review - how to implement, verify, review, rule on findings and how many rounds, by default and for agister/ and warder/. Not for an implementer working on a brief, which implements the brief and reports its change.
---

# Deliver a change

These are the rules for the session that delivers a change: it delegates
the implementation and the review, verifies the result and rules on the
findings. An implementer working on a brief does not follow them.

The default holds everywhere in the repository. A project's part below
holds for its directory and replaces the default there. The `AGENTS.md`
files hold what anyone changing the code needs, such as the verification
rules and the test commands; they hold in every case.

## Default

- Delegate implementation runs to a subagent on Opus 5.5. Brief it with
  the plan; it delivers the fix with its tests. Verify its result
  yourself, starting with `scripts/handoff-check.py --claimed <files it
  lists>`: every changed file was claimed. Then the tests pass; do not
  rely on the implementer's own report.
- Have Codex review the result critically:
  `codex exec --sandbox read-only --ignore-rules -m gpt-6.1-sol -c model_reasoning_effort="high" "<prompt>" < /dev/null`.
  Keep `--ignore-rules`: without it, the allow rules in `~/.codex/rules`
  run commands such as `git commit` outside the sandbox (LAB-125).
- Keep the loop tight: at most 2 review rounds. Judge each finding; fix
  what belongs to the issue. Record in the project's deferred work only a
  real, observed gap outside the issue; reject a speculative one.
- A project's part below replaces these steps for its directory.

## Agister: `agister/`

This part is for a change to Agister, under `agister/`, and replaces the
default; the root `AGENTS.md`'s verification rules still apply. The test
commands are in `agister/AGENTS.md`.

Agister is developed by dogfooding: its own implementation and review run
through Agister, from the repository root.

- Implement through the `implement` process, from the change's worktree
  (ADR-025): commit the candidate so the worktree is clean, write the
  brief to a file, and run
  `agister run implement --param candidate=HEAD --param brief=<file>`.
  Its changes are then in that worktree, uncommitted, for you to verify
  and commit; nothing is applied, and `changes.patch` is only the
  evidence. Review fixes go to a fresh `implement` run with their own
  brief; only a failing verify goes back to the same session, which
  Agister does itself.
- Verify the result yourself as the default says:
  `scripts/handoff-check.py`, then the tests. No mutation or revert checks.
- Review a committed candidate from the same worktree, with the
  candidate checked out:
  `agister run code_review --param base=<rev> --param candidate=HEAD --param goal=<file>`.
  Reviews are readers: they share the worktree and run together. The
  goal is the file that says what the change is for, its issue or brief,
  and a call without it is refused (ADR-023). The goal file names
  the done gates the change touches, and any edit to an agent instruction
  the owner asked for in the change. Act on
  the rulings as written, without judging them again: fix items go to a
  fresh `implement` run, owner items to the advisor (below), defer items to a
  backlog issue in the Multica project Agister. Waive items get no repair and
  no backlog issue; list them in the pull request description with their
  switching condition. Rejections for missing evidence are feedback on the
  reviewers' prompts, not the judge's.
- For an owner item, write the question file: who asked (the workflow run
  and item), the question and the options (the item's `action`, unedited),
  nothing else. Commit what the question is about and run, with it
  checked out,
  `agister run advisor --param question=<file> --param revision=HEAD`.
  Append its decision to `agister/docs/decisions.md` as a record, unedited,
  with status `Provisional (advisor)` and the run ID, and list the
  provisional records in the pull request description. Only an `owner`
  answer goes to the owner.
- Review a change that adds or edits an ADR with
  `agister run adr_review --param base=<rev> --param candidate=HEAD --param goal=<file>`,
  from the same worktree, before the code that follows it; its rulings
  are acted on the same way.
- At most 3 review rounds. Deferred work is a backlog issue in the
  Multica project Agister: gap, trigger, done when, for real, observed
  gaps only.
- A failure of Agister itself during this work is a finding about Agister:
  record it and fix it; do not route around it. A Claude Code subagent or
  `codex exec` is a fallback only when Agister cannot run the step; say
  why.

### Decision records

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

## Warder: `warder/`

This part is for a change to warder, under `warder/`, and replaces the
default; the root `AGENTS.md`'s verification rules still apply. Use
Agister's processes, never a direct subagent or a direct `codex exec`
review.

- Implement through `implement_warder`, whose verification is
  `warder/scripts/test.sh`, not the Agister check of `implement`. From the
  change's worktree, with the candidate committed and the brief in a file:
  `agister run implement_warder --param candidate=HEAD --param brief=<file>`.
- Verify the result yourself: `scripts/handoff-check.py --claimed <files>`,
  then `warder/scripts/test.sh`.
- Review the committed candidate with
  `agister run code_review --param base=<rev> --param candidate=HEAD --param goal=<file>`,
  and send fixes to a fresh `implement_warder` run with their own brief.
- A run refused because a runtime's version is not verified (for example
  `runtime mapping codex verifies no primitive for codex version …`) is a
  block, not something to work around. Verify the new version first, as
  the mapping's comments describe (`agister/home/runtimes/`), adopt it
  through `agister install agister/home`, then run the process. Never fall
  back to calling the runtime directly.
