# hermes-memory-review-agent — Log

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
