---
date: 2026-06-01
model: claude-opus-4-8
description: "Cross-cutting TODO for the agents/ directory — concerns spanning more than one OpenClaw agent; open items numbered, completed work under Done"
---

# agents/ — Cross-Cutting TODO

Concerns that span more than one agent under `agents/` live here, not in a single agent's `TODO.md`. Per-agent tasks stay in `agents/<agent>/TODO.md`. Open items are numbered below.

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

## 2. Runtime cron wrappers are not CI-synced

The per-agent `<agent>-sync.yml` workflow ships only `agent/**` to the VPS workspace. The `runtime/` cron wrapper (`<agent>-cron.sh`) is deployed manually (scp + `chmod 700`), so a wrapper edit in the repo does **not** reach the VPS until someone re-deploys it. Same gap for `doc-drift-agent` and `maestro-flow-review-agent`.

- [ ] Decide: extend a sync mechanism to also ship `runtime/cron/*.sh` (mode 700), or formally document the manual re-deploy as a required step in each runtime README and a checklist.
- [ ] Whichever is chosen, make wrapper drift detectable (e.g. a checksum compare on deploy).

## 3. `/run` (or a slash command) to invoke an agent from its topic

Today an agent is triggered by `@`-mentioning the bot in its topic with an instruction (`requireMention: true`). To get a simple `/run`:

- **A — real `/run` trigger:** add `channels.telegram.customCommands: [{command:"run", description:"…"}]` (Telegram menu entry — note: `customCommands` are menu-only, they do **not** implement behavior) **and** teach each agent's `AGENTS.md`/system prompt to treat a bare `/run` as "do your job" (maestro → review the flow collection; doc-drift → drift review; dashboard-sync → sync).
- **B — type-anything:** set a topic's `requireMention: false` so any message there triggers its agent (no command needed; noisier — every stray note triggers a run).

- [ ] Decide A vs B (A preferred for a deliberate trigger).
- [ ] If A: add the `customCommands` menu entry + update each agent's system prompt to handle `/run`.

## 4. Watch: tasks/TaskFlow ledger not populating on the VPS

The OpenClaw **tasks / TaskFlow ledger** records nothing on the live unit
(`107.172.143.196`, OpenClaw `2026.5.28`), for any run type tested — foreground
`openclaw agent`, the in-gateway `lobster` tool, or cron-dispatched isolated
turns. Evidence and full diagnosis: `agents/research/phase4-substrate-spike-findings.md` §4.
The docs say cron and CLI runs **should** create task records; the machinery
exists (`task_runs` table, `recordTask`, cron files wired) and `doctor` finds no
fault, but `runs.sqlite` stayed ~9 h stale while a 10-minute cron succeeded, and
`tasks maintenance` is all-zeros. Root cause undetermined; likely a `2026.5.x`
behavior/version gap. Not doctor-fixable, no config gate.

This blocks consolidating run observability onto the ledger (ties to §1). Until it
resolves, the orchestrator (ADR-001 §7 amendment) relies on the wrapper's
**fail-closed Telegram notification + log + per-scope state** for observability
instead (cron run history does not apply to the `/etc/cron.d` wrapper).

### Watch

- **Next check: 2026-06-16** (~2 weeks). Re-verify on the then-current OpenClaw
  version whether the ledger populates.
- Recheck procedure: trigger one isolated cron/agent run, then
  `openclaw tasks list --json` + `openclaw tasks maintenance --json`; compare the
  `~/.openclaw/tasks/runs.sqlite` mtime against the run time.
- If it populates: file/close the upstream issue note, and reconsider moving
  observability from cron run history onto the ledger (revisit ADR-001 §7).
- If still empty: bump the next check another 2 weeks and consider filing an
  upstream issue with the §4 evidence; record the live observation in `inventory`
  `vps/OpenClaw/migration.md`.
