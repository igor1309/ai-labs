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
- [ ] Confirm `sqlite3` on the gateway.
- [ ] Deploy `runtime/**` by hand (scp + chmod 700 + install cron entry); mirror
      into inventory `migration.md` + `log.md`.

## Later

- [ ] Option C: per-candidate proposal files + PRs against the canonical repo
      (`reviews/skill-proposals/<date>/<skill>-NNN.md`), human merge only.
- [ ] Multi-bot aggregation (per-source cursors, count aggregation, partial-source
      failure) beyond the v0.0.1 single-bot scope.
- [ ] Optionally extract the deterministic wrapper logic (cursor, suppression,
      no-op, delivery) into a test harness to automate the T13–T22 subset.
