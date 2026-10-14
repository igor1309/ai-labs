# LAB-46 branch review round 1 fixes

Review rulings (code_review run 20261001T143449Z-f65c50). Make each fix as
its action says, with its tests. The owner item about skills in a
tool-less Pi call is not part of this brief.

## 1. Terminal state stays set when compaction resumes the agent (major)

Action: Clear terminal state when recovery continues after compaction, and add regression tests for an interruption before the recovery's agent_end.

Why: The reviewer gives a concrete event sequence checked against installed Pi 0.85.1: overflow error, agent_end(willRetry=false), compaction_end, agent_start, a stop message_end, then a timeout before the next agent_end. The trace follows it line by line through the new adapter: Ended is set at pi.go:390, not cleared at 404 or 364, Final is replaced at 430, WithoutTerminal is bypassed at 464, and Completed is returned at 488 and accepted at calls.go:798. The change introduced the adapter, and no other reviewer contradicts this.

## 2. Automatic compaction usage and cost are dropped from the turn tally (major)

Action: Include compaction_end usage in the tally, preserving unknown figures, and test a stream that has both assistant and compaction spend.

Why: The case is concrete: an assistant message costs $0.25, compaction reports $0.50 in compaction_end.result.usage, and the turn records $0.25. The trace shows the message added at pi.go:411, compaction_end falling through at 404, and the partial sum returned as known at 463/577 and recorded at calls.go:789. The reviewer cites ADR-001:176 for runtime-reported usage and cost, and confirmed against installed Pi that the event carries this usage.

## 3. CLI wiring of the home-scoped Pi session directory is untested (minor)

Action: Add a fake-Pi CLI continuation test asserting that the session directory is under the temporary home and that the continuation resumes the recorded session.

Why: The trace shows the new wiring at main.go:150 (config.Home/pi/sessions) is exercised by no test. The adapter tests inject their own Sessions directory (pi_test.go:224, 244), and the CLI test makes one fresh call and asserts only the plan and tool arguments (pi_settings_test.go:53, 57). This is a concrete gap in behaviour the change introduced.

Pi's docs are in the installed package
(`$(npm root -g)/@earendil-works/pi-coding-agent/docs/`). Do not call a
real provider. Run the full check from `agister/` (its AGENTS.md). Report
each command with its exit code and final line, and list every file you
changed.
