# LAB-7: cost of turns that resume a Claude Code session

Work in the Go module `agister/`.

## The defect (observed)

Claude Code's `total_cost_usd` in its result is the session's cumulative
cost, not the turn's. Agister records it as the turn's cost
(`internal/adapters/runtime/claudecode/claudecode.go`, `turn.CostUSD`), so
every turn that resumes a session counts all earlier turns of that session
again.

Run `20260930T092147Z-1f36d6` continued run `20260930T082703Z-c5192a`
(cost 7.830211) in session fb62c958. Its provider stream reports
`total_cost_usd` 7.830211, then 12.6246154 (turn 1), then 13.620291
(the verify repair turn, same session). Agister recorded turn costs 12.62
and 13.62 and a run cost of 26.24; the run's real cost is 13.620291 −
7.830211 = 5.79 (turn 1: 4.79, repair: 1.00). The same applies to every
continuation (`--continue`) and every verify repair turn.

## Required

- A turn's recorded cost is what that turn cost: the session's reported
  total minus the session's total before the turn. The session's total
  before a turn is known from the previous turn in that session, in this
  call (a repair turn) or in the continued run (a continuation). Record
  what is needed for that on the turn, so a later continuation can use it.
- The call's cost, the cost limit's remaining budget for repair turns, and
  `agister runs show` use the corrected per-turn costs.
- A resumed turn whose session total before it is unknown (for example, a
  continuation of a run recorded before this change) has unknown cost,
  like any turn with unknown cost today; do not guess.
- A fresh session's first turn is unchanged.
- Codex is out of scope unless its reported usage has the same problem;
  say what you find.

## Tests

Committed tests with the fake runtimes, deterministic, no real clock:
a continuation and a verify repair each record the turn's own cost from
cumulative totals; the call's cost sums the corrected costs; the remaining
budget given to a repair turn uses them; a resumed turn with an unknown
earlier total records unknown cost. Use the module's quiet test commands
from `agister/AGENTS.md`; report each with its exit code and final line,
and list every file you changed.
