---
date: 2026-06-25
model: claude-opus-4-8
description: "Intake brief for the product-research-agent — an on-demand (no-cron) OpenClaw agent reachable via a new ai-labs supergroup topic that runs evidence-only product research from prompts/product-research.md and delivers the report as an attached file"
---

# product-research-agent — Intake Brief

Context capture for a new specialized OpenClaw agent. This is the intake
deliverable only — no implementation, no plan. Downstream work (ADR, plan,
build, VPS wiring) is out of scope here.

## What I'm Building

A new specialized OpenClaw agent — `product-research-agent` — that is a sibling
to the existing `agents/` agents (`doc-drift-agent`, `maestro-flow-review-agent`,
`dashboard-sync-agent`) but breaks their mold in two ways:

1. **On-demand only — no cron / no scheduled trigger.** It runs solely when the
   maintainer messages it via Telegram. (Maestro is cron-only; doc-drift is
   DM+cron; this one is inbound-only — the simplest runtime of the family: no
   wrapper, no suppression gate, no heartbeat contract.)
2. **Reviews no repo and opens no PRs.** Its job is to take a Company/Product
   (and optional product family / use-case) handed to it over Telegram, run
   **evidence-only** research per `prompts/product-research.md`, and deliver a
   structured research report back to the maintainer.

The eventual work product (not this intake) is: an agent definition under
`agents/product-research-agent/`, a CI sync workflow, runtime wiring on the
OpenClaw VPS (an `agents.list` entry + an inbound Telegram binding to a **new
topic**, no cron), and the matching `inventory/vps/OpenClaw/*` reflection.

## What I'm Touching

In `ai-labs`:
- **`prompts/product-research.md`** — the research prompt that defines the
  agent's task (evidence-only; scope-locked to the named product/family; 8-section
  report + source appendix). Its front-matter `model: gpt-5.5-thinking` names the
  **co-author** of the prompt, not a runtime requirement — no model constraint
  flows from it.
- **`agents/product-research-agent/`** — new agent dir following the established
  layout: `agent/agent.md` (→ `AGENTS.md` on the VPS), supporting `agent/*.md`,
  `docs/` (this file + a project `log.md`), `README.md`, `TODO.md`. No `runtime/`
  cron wrapper (on-demand agent).
- **`.github/workflows/product-research-agent-sync.yml`** — new CI sync workflow
  modeled on `doc-drift-agent-sync.yml` (rsync `agent/**` → VPS workspace, rename
  `agent.md`→`AGENTS.md`, `OPENCLAW_DEPLOY_SSH_KEY`).
- **`agents/README.md`**, **`agents/TODO.md`** — register the new agent.
- **`.agents/new-project-checklist.md`** outputs — likely **not** triggered
  (this is an `agents/` subdir, not a new top-level dir), but confirm at plan time.

In `inventory` (live-VPS reflection, same change set per the maintenance rule):
- **`vps/OpenClaw/README.md`** (Agents table + Telegram routing table — add the
  new topic), **`migration.md`**, **`log.md`**.

## Findings

- **Scope:** Searched both working trees for `openclaw` (~70 files); read the
  OpenClaw `README.md`/`CLAUDE.md`, `agent-cron-jobs.md`, the maestro agent
  definition + README, `agents/` README/TODO/gotchas, the new-project-checklist,
  the doc-drift sync workflow; plus web research of OpenClaw's published docs and
  issue tracker for the two feasibility questions below. Excluded: live-VPS state
  (SSH needs explicit per-session authorization).
- **Pattern evidence:** Three existing specialized agents follow one template —
  `agent/agent.md` deployed as `AGENTS.md` via CI rsync; runtime owned by
  OpenClaw; notifications/inbound through the **shared** `@igor1309_ai_labs_bot`
  (account `ai-labs`) in forum supergroup `-1003954520541`, **one topic per
  agent** (`#maestro-review`=2, `#doc-drift`=4, `#dashboard-sync`=6, `#health`=8).
  Each new specialized agent has historically been introduced with an ADR
  (`adr-specialized-openclaw-agent-*.md`).
- **Inbound routing** is per-topic:
  `channels.telegram.accounts["ai-labs"].groups."-1003954520541".topics.<threadId>.agentId`,
  `groupPolicy: "allowlist"`, `requireMention: true` (`@`-mention to trigger).
  A **new topic** + a new `agentId` mapping is the registration unit.
- **Agent registration** = an entry in `openclaw.json` `agents.list` (`{id,
  workspace}`) + the inbound topic binding. Maestro is registered *without* an
  inbound binding (cron-only); this agent is the inverse — inbound binding, no cron.
- **CI syncs `agent/**` only; `runtime/**` is hand-deployed** — moot here, since
  this agent has no cron wrapper.

### Feasibility research (resolved)

**Web research — feasible; provider decided.** OpenClaw ships agent web tools:
`web_fetch` (plain HTTP GET, HTML→markdown, **no key**, on by default) and
`web_search` (enabled by default but needs a provider selected). Our keys file
holds only OpenRouter + OpenAI — no Brave/Tavily/Exa key — so a key-required
provider is not wired. **Decision: use the key-free `Codex Hosted Search`
provider** (rides the existing Codex/OpenAI OAuth; runtime harness is
`codex/gpt-5.5`). Open verify-on-host item: confirm/set
`tools.web.search.provider` on the live `openclaw.json` (needs SSH authorization).
Sources: docs.openclaw.ai/tools/web, docs.openclaw.ai/tools/web-fetch.

**File-attachment delivery in a forum topic — possible only by shelling out.**
This is the load-bearing constraint:
- OpenClaw's agent **message tool does not send generic documents** — outbound
  agent media is limited to image/audio/video/sticker via `mediaUrl`; a `.md`/`.pdf`
  *document* is not in that set (docs.openclaw.ai/channels/telegram).
- In **forum topics** the message tool is **auto-disabled entirely**
  (`disableMessageTool=true`, not overridable by `actions.sendMessage`/`tools.allow`)
  — OpenClaw issue #31368, **closed as not planned / stale**. Our chosen surface (a
  topic in `-1003954520541`) is exactly this case.
- **Working path (decided):** the agent writes the report to a file, then uses its
  `exec`/shell tool to deliver it via a direct Bot API **`sendDocument`** call
  (supports `message_thread_id`; documents up to 50 MB) — the same deterministic
  Bot API pattern the existing cron wrappers use for `sendMessage`. The
  `openclaw message send --channel telegram --target <chat> --thread-id <topic>
  --media <file>` CLI is the documented workaround but is image/audio/video-oriented,
  so `sendDocument` is the robust route for a document. A short text reply
  ("report attached" + a 1–2 line summary) can still ride the normal channel.
- This constraint **must be baked into the agent definition** (it's behavioral,
  not a config toggle), and is worth encoding in the reusable skill (see TODO).

## Key Constraints

- **On-demand, no cron.** No wrapper, no suppression gate, no heartbeat. The agent
  acts only when `@`-mentioned in its topic by the allowlisted maintainer.
- **Surface = a new topic in the existing ai-labs supergroup** `-1003954520541` on
  `@igor1309_ai_labs_bot` (account `ai-labs`), allowlisted to chat `54589373`,
  `requireMention: true` — reuses all existing routing machinery.
- **Evidence-only research.** The agent obeys `prompts/product-research.md`
  verbatim: scope-locked to the named product (+ explicit family), no pricing/GTM/
  funding/competitor/market-size/editorial content, cite sources, flag stale/missing
  evidence, no product judgment.
- **Report delivered as an attached file** via the agent→`exec`→Bot API
  `sendDocument` path (forum-topic message-tool limitation above).
- **Web search via Codex Hosted Search** (key-free); `web_fetch` for known URLs.
- **Maintenance rule:** any live-VPS change (`openclaw.json`, bindings, topic) must
  be mirrored in `inventory/vps/OpenClaw/migration.md` + `log.md` in the same change.
- **SSH to the live host needs explicit per-session authorization** naming the host.
- **Markdown front-matter** (`date`/`model`/`description`) required on all new `.md`.

## Risks & Unknowns

1. **Live web-search provider config** — Codex Hosted Search is the decision, but
   whether it's already selected on the live `openclaw.json` is unverified (needs SSH).
   If unset, wiring it is part of the VPS step.
2. **Report length / `sendDocument` mechanics in practice** — the exec→Bot API path
   is documented and matches existing wrapper usage, but hasn't been exercised by an
   inbound (non-cron) agent here; first live run is the proof.
3. **Whether to ADR this** — every prior specialized agent shipped with an
   `adr-specialized-openclaw-agent-*.md`. This one is simpler (no cron, no repo, no
   PRs) but still adds a live binding; decide ADR vs. lighter doc at plan time.
4. **Prompt embedding vs. reference** — the existing agents read their *standard*
   fresh from the repo under review and forbid vendoring a stale copy. Here the
   "standard" is `prompts/product-research.md`. Whether the agent embeds it in
   `AGENTS.md` or references a synced copy is a design decision for the plan.

## Non-Goals

- No cron / scheduled run, no suppression gate, no dead-man's-switch (agents/TODO §1
  does not apply — nothing scheduled to miss).
- No repo review, no PR opening, no `gh` write access.
- No product judgment, strategy, pricing, or competitor analysis (prompt forbids it).
- No change to the existing three agents or the shared bot/supergroup beyond adding
  one topic + binding.
- Building the reusable "add an OpenClaw agent" skill is a **separate follow-up**
  (tracked in `agents/TODO.md`), not part of this agent's build.

## Open Decisions for Planning (not solutioned here)

- ADR vs. lighter design doc.
- Prompt embedded in `AGENTS.md` vs. referenced/synced.
- Exact report file format (`.md` vs `.pdf`) and filename convention.
- New topic threadId + the `#product-research` topic name.
