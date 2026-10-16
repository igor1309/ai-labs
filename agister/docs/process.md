# How we work on agister

## Roles

- **Owner**: owns the ADRs and the direction; gives the go after each
  triage. Asked only what would change an ADR or reverse a recorded
  decision. Reads no code, approves no finding.
- **Spec writer** (Claude): writes the feature files and the
  implementation notes; triages every review, deciding each finding with
  its reason; shows every input and output in full.
- **Implementer** (agister, an `implement_*` workflow): codes and tests
  the reviewed spec.
- **Reviewers**: a subagent and Codex on a spec; agister's `code_review`
  on a branch. One job per agent.

## Priorities

Best effort, core first. The design moves fast; perfection and corner
cases are out. A case is handled when met. What is real but deferred
goes to `backlog/`; nothing is dropped silently.

## The loop

1. **Spec**: feature files and the notes, in the part's own ports and
   words (ADR-001). Committed apart from code.
2. **Self-check**: `scripts/loop/spec-check.sh` aligns tables and
   reports wide prose, a feature near 100 lines, a backlog file named
   and missing. By hand: every Background is a document documents
   accepts; names agree across rows and scenarios.
3. **Spec review**: `scripts/loop/spec-review.sh [commit]`: Claude and
   Codex, read-only, on one prompt rendered from
   `scripts/loop/spec-review-prompt.tmpl`: task, where, where the
   context is. No leads, no focus, no earlier findings; only the commit
   changes. At most two rounds a section; a third only at the owner's
   word.
4. **Triage**: both outputs read in full, then take, reject, backlog or
   ask the owner for each finding, with its reason. Core or cheap is
   taken; taste, churn and corner cases are not. A rejected point goes
   to the notes' Decisions, with its reason, so no reviewer raises it
   again. The round's table is kept beside the reviews.
5. **Owner's go**, and the goal file written once: its "Done when" is
   every scenario proven; the implementer works to it, and the branch
   review reads it.
6. **Implement**: one test per scenario, race detector on, through
   `./scripts/test.sh`. Committed by `scripts/loop/commit.sh <message>
   <file>...`, which commits only on green; spec, code, test fix and
   backlog apart.
7. **Batch**: no review cycle for a small fix; it rides the next one.
   Sections share a round where they can.
8. **Branch review**: `scripts/loop/branch-review.sh`: agister's
   `code_review` on the goal file, rendered to markdown with a triage
   skeleton; triage; the owner's go.
9. **PR**: `/pr-merge`, merge commit, CI in the background; its body
   lists what was rejected and backlogged. The PR is no goal of its own.

## Mechanics

- The scripts are `agister/scripts/loop/`, run from the branch's
  worktree. A branch has its directory, `/tmp/<branch>/` (or
  `$LOOP_DIR`): its `config.sh`, and every prompt, review and triage,
  numbered by round. What is in a file is not repeated in a turn.
  `config.sh` sets:

  ```sh
  WT=<the branch's worktree>
  GOAL=/tmp/<branch>/goal.md
  TEST_DIR=agister
  FEATURES="agister/settings/<part>/*.feature"
  NOTES=agister/docs/settings-implementation.md
  SECTION='the section "<title>"'   # the notes' part under review
  ```
- Long runs (tests, Codex, agister, CI) in the background; wait for the
  notification, never poll.
- Absolute paths.
- A failure's root cause is found, and named, before a fix.
- Separate reviews asked for stay separate.
- One ntfy push, only for a real block.
