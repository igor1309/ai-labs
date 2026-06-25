---
date: 2026-06-25
model: claude-opus-4-8
description: "product-research-agent project README — a draft on-demand OpenClaw agent that runs evidence-only product research per the repo's product-research prompt and returns a structured report as an attached Telegram file; schedules nothing and opens no PRs"
---

# product-research-agent

Draft definition for a specialized OpenClaw agent that, on request, researches the
current public state of a named company's product using **evidence only** and returns
a structured report to the requester as an **attached file** over Telegram.

Sibling to `doc-drift-agent` and `maestro-flow-review-agent` in that its definition
lives here and its runtime is the OpenClaw VPS — but it inverts their shape:

- **On demand, not scheduled.** It has no cron wrapper, no suppression gate, and no
  heartbeat. It runs only when `@`-mentioned in its Telegram topic.
- **It reviews no repository and opens no PRs.** Its only output is the research
  report it returns.

The research *standard* is not owned here either: it is the repo's
[`prompts/product-research.md`](../../prompts/product-research.md), deployed into the
agent's workspace as `research-prompt.md` by the CI sync workflow and read fresh each
run — so the canonical prompt stays the single source of truth and is never vendored
into this directory.

## Status

**Live (2026-06-25).** Deployed on the OpenClaw VPS: registered in `openclaw.json`
`agents.list`, bound inbound to the **`#product-research` topic (threadId 117)** in the
ai-labs supergroup (`-1003954520541`) on `@igor1309_ai_labs_bot` with **`requireMention:
false`** (type a request directly, no `@`-mention), workspace synced by CI. Web search via
the key-free **Codex Hosted Search**; reports delivered as a Telegram file via the agent's
`exec`→Bot API `sendDocument`. **Verified end-to-end** — a live "Research …" request
returned a report as a file attachment. (Required upgrading the gateway 2026.6.8→2026.6.10
so forum-topic replies render plainly: rich messages default off since 6.9 / PR #94048 —
see `inventory` `vps/OpenClaw/log.md` 2026-06-25.) Born out of the intake brief in
[`docs/intake.md`](docs/intake.md).

## Layout

| Path | Purpose |
|------|---------|
| `agent/agent.md` | Agent system prompt → deployed as `AGENTS.md` |
| `docs/intake.md` | Intake brief (design, feasibility findings, constraints) |
| `docs/log.md` | Project log |
| `README.md` | This file |
| `TODO.md` | Project TODO list |

The research methodology is **not** vendored here — it lives in the repo's prompts:

| Path (in this repo) | Purpose |
|------|---------|
| `prompts/product-research.md` | Evidence-only research prompt; the CI workflow deploys it into the workspace as `research-prompt.md` |

There is no `runtime/` directory: the agent is inbound-only, so it has no cron
wrapper to deploy.

## Boundaries

- **Evidence-only.** Reports what the evidence shows; never evaluates it. The prompt's
  ignore list (pricing, positioning, GTM, funding, market size, competitors,
  editorial/ethical/generic-AI commentary) is binding.
- **Scope-locked.** Only the named product and an explicitly provided family — no
  adjacent products, competitors, or ecosystem inference.
- **Cite or flag.** Every factual claim carries a source; unsupported claims are
  marked evidence-missing, stale sources marked stale.
- **Returns a file, writes no repo.** The report is delivered as a Telegram
  `sendDocument` attachment to the originating topic; the agent changes no repository
  and opens no PRs.
- **On demand only.** No schedule, no self-triggering.

## Description

Draft on-demand OpenClaw agent that researches a named company's product from public
evidence — the prompt's eight-section report (overview, capabilities, workflow map,
technical/workflow surface, integrations, recent changes, stale/missing evidence,
source appendix) — and returns it as an attached Markdown file in its Telegram topic.
The standard is the repo's `product-research.md`, read fresh each run; the agent
cites every fact, flags gaps, and offers no judgment.

## Stack

- OpenClaw
- Telegram (Bot API `sendDocument`)
- `web_fetch` + `web_search` (Codex Hosted Search)
- Markdown
