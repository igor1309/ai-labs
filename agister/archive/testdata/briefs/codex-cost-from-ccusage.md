# Codex turn cost from ccusage

Work in the Go module `agister/`.

Codex reports token usage, not cost, so Codex turns record no cost today.
Get it from `ccusage` (installed on the operator's PATH):
`ccusage codex session --json` lists sessions with `sessionId` (a rollout
path ending in the Codex session ID) and `costUSD`, the session's
cumulative cost, priced online from LiteLLM. Observed 2026-09-30, ccusage
20.0.26: session 01a0f1e9-210c-7853-b2dc-7abbe3cf6073 (gpt-6.1-sol)
reports costUSD 0.318266.

Required:

- After a Codex turn, Agister reads that session's cumulative cost from
  `ccusage` and records the turn's cost by the same baseline rule as
  Claude Code: the session's total less the latest total Agister recorded
  in that session.
- A cost of zero, a missing session, `ccusage` missing or failing: the
  cost is unknown. Nothing else.
- The call runs `ccusage` through a seam (an injected function or
  interface), so tests never run the real tool.

Tests (normal, deterministic, no real ccusage): a fresh Codex turn records
the reported cost; a resumed one records the difference; zero, missing
session and a failing tool each give unknown. Use the quiet test commands
from `agister/AGENTS.md`; report each with its exit code and final line,
and list every file you changed.
