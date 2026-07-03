---
date: 2026-07-01
model: claude-opus-4-8
description: "Intake brief for the OpenClaw hermes-memory-review agent (core/skills): weekly Hermes memory-snapshot review report + hourly memory-update ping, authored in ai-labs; wiring owned by inventory."
---

# Intake Brief — OpenClaw `hermes-memory-review` agent (core/skills)

Source of truth: `inventory` repo `vps/OpenClaw/hermes-memory-review-agent-handoff.md`
(read 2026-07-01, post-update) and `vps/Hermes/adr/adr-001-canonical-skill-distribution.md`.

## What I'm Building

A **new scheduled OpenClaw agent definition** in ai-labs — a sibling of the
existing maestro / doc-drift / dashboard agents — that performs the **review
step** of the Hermes self-improvement loop (inventory ADR-001). It has two
cadences:

1. **Weekly review (Sunday 06:00 UTC).** Reads a read-only daily snapshot of a
   Hermes bot's memory/state/pending-writes and produces a **markdown review
   report** (Option B, build now) committed to the canonical coaching-skills
   repo at `reviews/memory-review/<YYYY-MM-DD>.md`. The report *proposes*; it
   never merges. A human is the sole promotion gate. Option C (per-candidate
   proposal files + PRs) is explicitly deferred.
2. **Hourly memory-update ping.** When the Hermes bots have staged new memory
   writes (`pending/memory`), post a short "memory updates were done" ping to a
   **new, separate** ai-labs Telegram topic — silent when nothing changed. Gives
   staged learning fast visibility instead of waiting for the weekly cycle.

The deliverable is the **agent core/skills only** — the agent-definition
directory, its `runtime/` cron wrapper (authored in ai-labs, per owner
decision), its CI-sync workflow, and repo registration. Inventory owns all
runtime wiring (enabling `write_approval` on Hermes, the daily snapshot job, the
cron scheduling/deploy, cross-host snapshot read, the canonical-repo location).

## What I'm Touching

New files, modeled on the doc-drift agent (closest structural analog — a
scheduled reviewer that emits a report and writes to a repo):

- `agents/hermes-memory-review-agent/agent/agent.md` → deployed as `AGENTS.md`
  (system prompt)
- `agents/hermes-memory-review-agent/agent/*.md` — supporting specs
  (report-format, notification-spec covering **two** Telegram surfaces, and the
  review prompt/template)
- `agents/hermes-memory-review-agent/runtime/cron/hermes-memory-review-cron.sh`
  — wrapper: repo freshening (`git fetch/checkout trunk/pull --ff-only`), any
  suppression gate, invokes the agent; drives both cadences
- `agents/hermes-memory-review-agent/runtime/cron/openclaw-hermes-memory-review.cron`
  — `/etc/cron.d` entries (Sunday 06:00 UTC weekly + hourly ping)
- `agents/hermes-memory-review-agent/runtime/README.md`
- `agents/hermes-memory-review-agent/docs/{log.md, adr-*.md}`, `README.md`,
  `TODO.md` (every sibling carries its own ADR referencing inventory ADR-001)
- `.github/workflows/hermes-memory-review-agent-sync.yml` — modeled on
  `doc-drift-agent-sync.yml` (rsync `agent/**` → workspace, `mv agent.md
  AGENTS.md`, on push to `trunk`, reuse `OPENCLAW_DEPLOY_SSH_KEY`)
- Registration edits: `agents/README.md`, root `README.md` `## Components`
  table (per `.agents/doc-maintenance.md` + new-project-checklist)

## Findings

- **Scope:** Read the two inventory source docs (handoff, post-update +
  ADR-001), the `add-openclaw-agent` skill in full, and the three sibling agent
  trees (maestro, doc-drift, dashboard-sync) plus the doc-drift sync workflow
  and `agent.md`. Coverage boundary: did not read the inventory-side snapshot
  job, cron, or canonical-repo — all inventory-owned, out of this deliverable.
- **Pattern evidence:** Strong analogs. `agents/doc-drift-agent/` is the
  template — scheduled reviewer, `agent/agent.md` + sibling `*.md` specs
  (`report-format.md`, `notification-spec.md`, `suppression-policy.md`), a
  `docs/adr-*.md`, a `runtime/cron/` wrapper + `.cron`, and a `<name>-sync.yml`.
  `maestro-flow-review-agent` shows the commit-to-repo variant.
- The referenced handoff is **not** in ai-labs — it lives in the separate
  `inventory` repo at
  `/Users/igormalyarov/Developer/my-apps/inventory/vps/OpenClaw/hermes-memory-review-agent-handoff.md`.
  A *different*, unrelated handoff (maestro/doc-drift contracts) sits in
  `$TMPDIR/handoff/`.
- Placement convention: agents go under `agents/<name>/` (maestro, doc-drift,
  product-research all do). `dashboard-sync-agent/` at repo root is the legacy
  outlier, not the convention to follow.
- CI-sync copies only `agent/**`; `runtime/**` is **not** CI-synced —
  hand-deployed via scp + `chmod 700`. Owner confirmed the wrapper is authored
  in ai-labs (source of truth), same as maestro/doc-drift; inventory still owns
  the deploy/scheduling act.
- Snapshot input shape (read-only, per dated dir): `memories/` (`MEMORY.md`,
  `USER.md`), `state.db` (SQLite, FTS5), `pending/<id>.json` (staged
  skill/memory proposals via `write_approval`), `local-skills/`.

## Key Constraints

- **Read-only over the snapshot.** Never write to Hermes; never auto-apply
  anything.
- **Human merge is the only promotion gate.** The agent proposes; it never
  merges or approves (mirrors the doc-drift/maestro ADR discipline).
- **Ownership boundary is firm:** ai-labs = agent core/skills (+ runtime wrapper
  as source of truth); inventory = the wiring act (snapshot job, cron
  scheduling/deploy, cross-host reads, canonical-repo location).
- **Two verified OpenClaw runtime constraints** (from `add-openclaw-agent`)
  apply: forum-topic file delivery requires shelling out to Telegram
  `sendDocument` via `exec` (the `message` tool is auto-disabled in forum
  topics) — relevant for delivering the weekly `.md` report; `web_search` needs
  a provider selected (`web_fetch` is free) if the review browses.
- **Report structure is fixed by the handoff:** front-matter + sections *New
  durable facts / Repeated coaching patterns / Corrections from the user /
  Failed approaches / Candidate skill improvements / Proposed canonical patches
  / Reject / ignore*, at `reviews/memory-review/<YYYY-MM-DD>.md`.
- **Two Telegram surfaces:** one topic for the weekly report, a separate new
  topic for the hourly memory-update ping. `notification-spec.md` must cover
  both. One-bot / one-topic routing — new topic(s) + `threadId`(s) needed
  (inventory-wired, but the spec is authored here).
- New sub-agent under existing `agents/` (no new top-level dir), but the
  **new-project-checklist** still applies for README/dashboard registration.

## Risks & Unknowns

- **Canonical skills repo identity/location is inventory-owned and not yet
  stated.** The `agent.md` needs to name where it commits
  `reviews/memory-review/<date>.md` (and, Option C, opens PRs). Until inventory
  provides it, the agent def references it abstractly — coordination dependency,
  not an authoring blocker.
- **Hourly ping needs a fresher input than the daily snapshot.** The weekly
  review reads the 18:00 UTC daily snapshot, but an hourly ping keyed on
  `pending/memory` cannot be served by a once-daily snapshot — it needs a
  near-live cross-host read of Hermes `pending/memory`. Detection mechanism and
  access are inventory-coordination items.
- **Hourly ping topic + posting bot are undecided** ("Open for ai-labs to
  decide"). Design-time choice for the planning phase.
- **`state.db` (SQLite FTS5) access** implies the agent shells out to `sqlite3`;
  tooling availability on the gateway is a runtime/inventory item to confirm.
- The weekly report writes to a repo → needs git/`gh` write scope + a
  branch/commit convention. Option B is a *committed report* (not a PR); the
  maestro (commit-to-trunk) vs doc-drift (PR-per-finding) split is a design
  choice for planning.

## Open decisions carried into planning (from the handoff)

- The review skill's prompt and the report template.
- The proposal file format and PR template (Option C, later).
- The hourly-ping's new topic and posting bot.
