---
title: "Postmortem / Retro for Coding Agents"
subtitle: "Research notes and pre-ADR input"
date: "2026-04-21"
model: got-5.4-thinking
type: "research"
tags:
  - ai-agents
  - codex
  - claude-code
  - postmortem
  - retro
  - developer-workflow
---

# Postmortem / Retro for Coding Agents

## Context

The target use case is not a mandatory retro after every coding-agent session. The desired shape is a **manual plus scheduled** retrospective flow that can produce:

- daily and weekly digests,
- terminal output plus a durable markdown artifact,
- personal findings and action items,
- proposed new skills or changes to existing skills,
- lightweight scoring for friction, waste, leverage, and similar signals.

The raw evidence is assumed to be local-first and broad in scope: transcripts, tool traces, shell context, Git context, and any other harvestable local session artifacts.

## Main finding

This is a real gap.

The ecosystem already has:

- raw session history,
- local state and resumable sessions,
- some built-in usage analysis,
- community dashboards and log browsers,
- memory / instruction surfaces for turning lessons into durable guidance.

What still appears underbuilt is the last mile: **a personal daily/weekly retro that reads local evidence and proposes workflow changes, rule changes, and skill deltas**.

## What exists today

### Claude Code

Claude Code now includes built-in commands around reflection and history, including `/insights`, `/stats`, `/recap`, `/team-onboarding`, and `/memory`.

Relevant references:

- Claude Code commands: <https://code.claude.com/docs/en/commands>
- Claude Code memory: <https://docs.anthropic.com/en/docs/claude-code/memory>
- Claude Code hooks: <https://docs.anthropic.com/en/docs/claude-code/hooks>
- Claude Code monitoring and usage: <https://docs.anthropic.com/en/docs/claude-code/monitoring-usage>

The overall direction is clear: Anthropic is treating usage analysis and learned workflow behavior as first-class operational concerns, not merely transcript storage.

### Codex

Codex guidance is less explicit on postmortem as a product surface, but the operational pattern is present. The official best-practices guidance explicitly recommends asking Codex for a retrospective when the agent repeats a mistake, then converting the lesson into durable repo guidance such as `AGENTS.md`.

Relevant references:

- Codex best practices: <https://developers.openai.com/codex/learn/best-practices>
- Codex advanced configuration: <https://developers.openai.com/codex/config-advanced>

Codex also exposes local state under `~/.codex`, resume flows, config layering, and local session artifacts sufficient for offline analysis.

### Community tooling

Community tools are already moving from transcript accumulation toward local analytics and session browsing.

Examples:

- Rudel: <https://github.com/obsessiondb/rudel>
- codex-logs: <https://github.com/wondercoms/codex-logs>
- Session Hub: <https://github.com/joseferben/session-hub>
- Codex Local Session Manager: <https://github.com/magj/sesh>
- Hindsight (Claude usage analytics): <https://github.com/sharpie7/hindsight>

Not all of these are equal in maturity or scope, but together they show the same direction: session visibility is becoming a local tooling layer of its own.

## How people seem to be doing this in practice

The dominant pattern is **not** “run a heavy retro after every session.”

A more realistic pattern is:

1. keep raw local evidence,
2. expose lightweight history or stats continuously,
3. run deeper retro only on suspicious or important sessions,
4. convert repeated friction into durable instructions, skills, rules, or playbooks.

This pattern is also supported by the products themselves:

- Claude Code exposes transcripts, hooks, debug logs, telemetry events, checkpoint history, and prompt/tool correlation.
- Codex exposes local session state, resumable sessions, repo-level guidance, and durable instruction surfaces.

## Converging best practices

### 1. Retro should end in durable behavioral change

The most important repeated pattern is not the report itself, but the **translation of findings into durable guidance**.

Examples:

- update `AGENTS.md`,
- refine `CLAUDE.md`,
- add or split scoped skills,
- introduce task-specific procedures,
- tighten repo-level rules,
- add environment or preflight checks.

A retro that stops at “interesting observations” is weaker than one that ends with concrete operational deltas.

### 2. Keep global rules small; move procedures into skills

Both ecosystems implicitly or explicitly push toward concise durable instructions and separate procedure-heavy artifacts.

That suggests a clean separation:

- **global rules** for broad non-negotiables,
- **repo rules** for local conventions,
- **skills** for reusable multi-step workflows,
- **playbooks** for complex but stable routines.

### 3. Analyze trajectories, not just outcomes

Good postmortems should not only ask whether the agent finished the task.

They should inspect patterns such as:

- repeated retries,
- reversals and re-implementations,
- approval friction,
- excessive context growth,
- tool failure clusters,
- long detours before the useful path,
- repeated user correction on the same point.

That is where most workflow value lies.

### 4. Prefer local-first analysis

For this use case, local analysis is a strength:

- privacy,
- better access to raw artifacts,
- no dependency on vendor-side dashboards,
- easier enrichment with shell, Git, and repo context.

### 5. Tiered inspection is the right model

A practical system should do:

- **cheap pass on all sessions**, then
- **deep read only on promoted sessions**.

This avoids turning retro into another expensive workflow tax.

## Practical implications for a local retro system

### Recommended architecture

A useful design is a two-layer system.

#### 1. Collector / indexer

Responsibilities:

- discover local Claude Code and Codex session artifacts,
- normalize metadata,
- enrich with repository, branch, changed files, shell history, and commits when available,
- maintain a searchable local index.

#### 2. Digest engine

Responsibilities:

- produce daily digest,
- produce weekly digest,
- support manual on-demand retro,
- run a cheap pass on all sessions,
- promote selected sessions into deeper inspection,
- produce findings, scores, actions, and skill deltas.

### Promotion criteria for deep inspection

A session should be promoted when any strong signal appears, for example:

- unusually long duration,
- high token or tool volume,
- repeated retries or reversals,
- permission friction,
- tool failure clusters,
- abandoned or partial outcome,
- architecture-heavy or release-affecting work.

### Output shape that matters

The digest should not be a transcript summary. It should be a decision artifact.

A strong shape is:

#### Scores

- drift
- waste
- friction
- leverage
- confidence

#### Findings

- recurring mistakes,
- recurring wins,
- expensive dead ends,
- best prompt patterns,
- best agent/tool combinations.

#### Actions

- tweak a global rule,
- add a repo rule,
- create a new skill,
- refine an existing skill,
- change approval defaults,
- add preflight checks,
- add a prompt template.

#### Skill deltas

For each proposed new skill or tweak:

- name,
- reason,
- trigger conditions,
- expected behavior,
- source sessions or evidence,
- whether it should be global or scoped.

## Suggested operating rhythm

### Daily digest

Keep it short and tactical:

- top friction patterns,
- top leverage patterns,
- 1–2 concrete changes worth making,
- sessions worth manual review.

### Weekly digest

Make it comparative and strategic:

- recurring patterns across the week,
- what would have prevented the most waste,
- what should become durable operating doctrine,
- what current rules or skills have gone stale.

### Manual command

Useful examples:

- `retro today`
- `retro week`
- `retro last 5`
- `retro session <id>`
- `retro skill-deltas`

## Why not start with a dashboard

A dashboard is tempting, but it is probably the wrong first move.

The market already has viewers, browsers, and local analytics prototypes. The underbuilt part is **learning extraction**:

- what changed behavior,
- what caused waste,
- what should become a rule,
- what should become a skill,
- what should be deleted as stale guidance.

A local CLI that emits terminal output plus markdown reports is a stronger first slice than a richer UI.

## Working synthesis

The strongest current model is:

**session analytics → selective retro → durable instruction update**

For Claude Code, that likely means:

- `CLAUDE.md`,
- scoped rules,
- skills,
- memory where appropriate.

For Codex, that likely means:

- `AGENTS.md`,
- repo guidance,
- durable prompting patterns,
- reusable operational procedures.

The remaining product gap is not access to session history. It is the systematic conversion of local session evidence into personal workflow evolution.

## Sources

### Official

- Claude Code commands: <https://code.claude.com/docs/en/commands>
- Claude Code memory: <https://docs.anthropic.com/en/docs/claude-code/memory>
- Claude Code hooks: <https://docs.anthropic.com/en/docs/claude-code/hooks>
- Claude Code monitoring and usage: <https://docs.anthropic.com/en/docs/claude-code/monitoring-usage>
- Codex best practices: <https://developers.openai.com/codex/learn/best-practices>
- Codex advanced configuration: <https://developers.openai.com/codex/config-advanced>

### Community / ecosystem

- Rudel: <https://github.com/obsessiondb/rudel>
- codex-logs: <https://github.com/wondercoms/codex-logs>
- Session Hub: <https://github.com/joseferben/session-hub>
- Codex Local Session Manager (`sesh`): <https://github.com/magj/sesh>
- Hindsight: <https://github.com/sharpie7/hindsight>
- Discussion of local analytics / black-box debugging need: <https://news.ycombinator.com/item?id=47350416>
- Related user discussion around Claude Code black-box visibility: <https://www.reddit.com/r/ClaudeAI/comments/1r90pol/claude_codes_cli_feels_like_a_black_box_i_built_a/>

## Notes for next step

This document is suitable as input for:

- a pre-ADR,
- an MVP specification for a local retro tool,
- a prompt / skill design session,
- a CLI/report schema draft,
- a comparison between “local custom script” and existing analytics tools.
