# LAB-7: a resumed turn's baseline comes from Agister's own records

Owner decision on the round-2 fix for re-continuation cost (judge
20260930T104718Z-dc2ef0, item 1): do not read provider files. Remove
`claudecode.SessionCost`, the Codex rollout reader, the `ConfigDir` /
`Home` runner fields added for them, and their tests.

Instead, a resumed turn's session totals before it are those of the latest
turn Agister has recorded in that provider session, on any run in the
store, not only the continued run: in A, then B continues A, then C
continues A, C's baseline is B's latest turn. A repair turn's baseline is
the previous turn in the same call, as now. When Agister has no recorded
totals for the session, the turn's cost and usage are unknown, as now.
Turns made on the session outside Agister are not seen; say so in a code
comment where the baseline is chosen.

Codex reports token usage, not cost: its running usage totals follow the
same rule.

Tests (normal, deterministic, fake runtimes): the judge's three-call case
with rising cumulative totals where the third call continues the first,
asserting the third call's own cost and usage; a session with no recorded
totals gives unknown. Use the quiet test commands from `agister/AGENTS.md`;
report each with its exit code and final line, and list every file you
changed.
