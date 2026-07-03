# hermes-memory-review-agent — Log

## 2026-07-03 — state.db made optional (degraded review)

Relaxed the `state.db` hard-fail so an unavailable session source no longer
blocks a run — the deploy blocker. `state.db`/`sqlite3` is now best-effort: if
absent, unreadable, corrupt, lacking FTS5, or the tool is missing, the weekly
review degrades to a **md/json-only review** over `memories/`, `pending/`, and
`local-skills/`, skips session mining, and still commits the report. The report
header and run-result carry a degraded marker (`Sessions reviewed: 0 (state.db
unavailable …)`, `Degraded: sessions`), and the wrapper echoes it into the
Telegram summary. All other required children stay hard preconditions. Spec: rule
17 added, rule 15 + T21 narrowed, T23 added. Touched `agent.md`,
`review-methodology.md`, `report-format.md`, the wrapper, `runtime/README.md`,
and the ADR.

## 2026-07-01 — Agent definition authored

Stood up the `hermes-memory-review-agent` definition from the inventory handoff
and ADR-001 (canonical skill distribution). Intake brief and spec v0.0.1
committed first; spec hardened against a Codex review (16 findings → 22 test
cases). Then authored the full definition:

- `agent/` — system prompt (weekly review), review methodology, report format,
  notification spec (two topics + fail-closed alert), 24h suppression policy.
- `runtime/` — a two-mode cron wrapper (weekly LLM review + deterministic hourly
  memory-ping, shared lock) and the `/etc/cron.d` entries (Sun 06:00 UTC weekly,
  hourly at :20 to avoid the Sunday collision).
- ADR, project README with the inventory-coordination checklist, TODO.

Key decisions: the hourly ping is deterministic and wrapper-owned (no LLM); the
LLM agent owns only the weekly review; behavioral tests T7–T22 are run-verified
(match-siblings), not an automated harness. Wiring (snapshot job, cron deploy,
cross-host reads, canonical repo, Telegram topics) stays inventory-owned;
placeholders in the wrapper fail closed until filled. Not yet deployed.
