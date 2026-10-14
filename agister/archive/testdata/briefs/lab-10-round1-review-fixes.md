# LAB-10, round 1 review fixes

Review of 62f2a545 (a failed call keeps its runtime's reason), code_review
run 20260930T194529Z-a9f718. One ruling, fix (minor):

No test covers deduplication when the stream reason contains the stderr
reason. Add a row to the table test in
`agister/internal/adapters/runtime/supervisor/supervisor_test.go`: stderr
"401 Unauthorized", stream "Error: 401 Unauthorized", nonzero exit,
expected message "exit code 1: Error: 401 Unauthorized". If the code does
not produce that, fix the code.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
