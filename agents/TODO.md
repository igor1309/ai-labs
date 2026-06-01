---
date: 2026-06-01
model: claude-opus-4-8
description: "Cross-cutting TODO for the agents/ directory — a unified run-observability (dead-man's-switch) system for all cron-based OpenClaw agents, plus other concerns spanning more than one agent"
---

# agents/ — Cross-Cutting TODO

Concerns that span more than one agent under `agents/` live here, not in a single agent's `TODO.md`. Per-agent tasks stay in `agents/<agent>/TODO.md`.

## 1. Unified run-observability for cron-based agents (dead-man's-switch)

### Problem

Nothing observes whether a scheduled agent run actually fired and succeeded — independent of OpenClaw, the VPS host, and the presence of a Telegram message. Today the only per-run signal is the message each agent's cron wrapper posts to Telegram (heartbeat / findings / failed / suppressed), and detecting its **absence is entirely manual**: a human has to notice nothing arrived.

Existing monitors do not cover this:

- **infra-monitor** (Cloudflare Worker, off-host) checks service-port liveness (`:18789`) every minute — blind to whether any agent's cron ran. The gateway socket can be up while crons silently never fire.
- **openclaw-auth-monitor** / **openclaw-refresh-monitor** are on-host, Telegram-delivered, and scoped to OAuth, not agent runs.
- Every agent signal *and* every alert funnels through Telegram from the same host. A host or Telegram outage mutes all channels at once, and nothing independent catches "agent X missed its run."

This is the **inverse of infra-monitor**: infra-monitor watches *is the service reachable*; this watches *did the scheduled agent run complete*. A single host (a Worker) could serve both, but they are distinct concerns and must not be conflated — this is its own unified system for cron-based agents, not an infra-monitor feature.

### Goal

One cross-cutting watcher for every cron-based agent (`doc-drift-agent`, `dashboard-sync-agent`, `maestro-flow-review-agent`, and future ones) that raises an alarm when an expected run does not check in on time — independent of the host and of the agents' own Telegram bot.

### Proposed shape — push-based dead-man's-switch

- Each agent's cron wrapper, on a **genuine** success (exit 0 + valid run summary — the same fail-closed bar `maestro-review-cron.sh` already enforces), pings an external check-in endpoint for that agent (`curl` a Worker URL or a healthchecks.io check).
- The external watcher holds each agent's expected cadence + grace window and **alarms when a check-in is missing** by the deadline (e.g. no maestro check-in by 03:10 UTC).
- The alarm travels over a channel **independent of the agents' Telegram bot and host**, so a Telegram or host outage cannot silence its own alarm — a separate bot at minimum, ideally a second transport (email / push / SMS).
- The in-band Telegram heartbeat stays (human glance-value); the dead-man's-switch adds the out-of-band **absence** alarm that nothing currently provides.

### Decisions / open questions

- **Watcher home:** extend the existing infra-monitor Worker (it already has KV + cron + its own bot) with a per-agent "expected-by" registry, or adopt a hosted dead-man's-switch (healthchecks.io). Reuse vs. third-party.
- **Suppression handling:** a legitimately *suppressed* tick is a non-run by design (maestro's 12h gate). The wrapper already posts a suppressed Telegram message — it must **also** check in on suppressed ticks ("deferred, alive") so suppression is not misread as a missed run. Contract: check in on **success and suppressed**; on **failure**, stay silent (let the absence alarm fire) or send an explicit `/fail` if the watcher supports one.
- **Registration:** how a new agent registers its schedule with the watcher — a static config entry vs. the wrapper self-registering on first check-in.
- **Per-agent identity + secret:** each agent needs a distinct check-in URL/token.
- **Alarm-channel independence:** which second transport, and where its credentials live (must not be co-located with what they monitor).

### Tasks

- [ ] Decide watcher home (extend infra-monitor Worker vs. healthchecks.io).
- [ ] Define the check-in contract (success + suppressed ping; failure = silence or `/fail`); pin per-agent cadence + grace window.
- [ ] Add the check-in `curl` to each cron wrapper (`doc-drift`, `dashboard-sync`, `maestro-flow-review`), gated on the same success bar as the heartbeat.
- [ ] Pick and wire the independent alarm channel.
- [ ] Write the design up (own doc/ADR) and reflect the live wiring in `inventory` (under `vps/monitoring/` or a new `vps/agent-watchdog/`).
