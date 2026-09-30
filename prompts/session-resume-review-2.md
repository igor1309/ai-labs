Round 2 (final) review of the Agister session-resume change: the diff from
the base to the candidate. Read `prompts/session-resume-review.md` for the
change and what to look for; the Claude Code contract is now
`claude-code/2` (decided: both contracts bumped).

Round 1 found three issues, now addressed; check that each fix is sound
and complete, and look for new defects the fixes introduced:
1. The continuation check must fail before the turn when any run record
   cannot be read (`CallRuns.Every`, `fsruns.Store.Every`).
2. A finished continuation that provably started no provider turn
   (`noTurn` in `agister/internal/app/calls.go`) no longer blocks its
   session; unfinished, abandoned and reaped runs still do.
3. Claude Code checks every reported session ID (init and result) against
   the resumed one (`Stream.check` in claudecode.go).

Report only material findings, with file, candidate line, severity and a
concrete fix. Be concise; no praise.
