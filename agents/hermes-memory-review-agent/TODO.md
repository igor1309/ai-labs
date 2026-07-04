---
date: 2026-07-01
model: claude-opus-4-8
description: "Forward tasks for the hermes-memory-review-agent: inventory-coordinated wiring before first run, and deferred Option C / multi-bot / test-harness work."
---

# hermes-memory-review-agent — TODO

Forward tasks only. Completed work drops off; its record is in git history, the
produced artifacts, and `docs/log.md`.

## Before first run (inventory-coordinated)

- [ ] Provision the inventory-owned wiring (snapshot job, cron deploy, cross-host
      reads, canonical repo, two Telegram topics) per `runtime/README.md`.
- [ ] Fill the `__SET_AT_WIRING__` placeholders in the deployed cron wrapper.
- [ ] `sqlite3` on the gateway is **optional** (only needed to re-enable session
      mining if `state.db` is later restored to the snapshot — see "Later"). Its
      absence degrades the weekly review to md/json-only, never blocks it (rule 17).
- [ ] Deploy `runtime/**` by hand (scp + chmod 700 + install cron entry); mirror
      into inventory `migration.md` + `log.md`.

## Later

- [ ] Restore `state.db` to the snapshot to re-enable session mining (a future
      version). Inventory dropped `state.db` from the daily snapshot because of
      its **size**; the agent now degrades to a md/json-only review without it
      (rule 17), so session-derived findings (coaching patterns, corrections, and
      failed approaches mined from sessions) are absent until this lands. The fix
      needs a size-aware approach (e.g. a pruned/compacted `state.db`, an FTS
      index subset, or an alternative session export) — **detailed design and
      discussion deferred**. Re-enables `sqlite3` as a gateway prerequisite.
- [ ] Option C: per-candidate proposal files + PRs against the canonical repo
      (`reviews/skill-proposals/<date>/<skill>-NNN.md`), human merge only.
- [ ] Multi-bot aggregation (per-source cursors, count aggregation, partial-source
      failure) beyond the v0.0.1 single-bot scope.
- [ ] Optionally extract the deterministic wrapper logic (cursor, suppression,
      no-op, delivery) into a test harness to automate the T13–T22 subset.
