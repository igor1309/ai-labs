---
description: Spawn the grounded researcher subagent to investigate a topic from cited sources
argument-hint: <question or topic, with any context and scope>
---

Spawn the `researcher` subagent (Agent tool, `subagent_type: researcher`) to investigate the following, then relay its findings:

$ARGUMENTS

Before spawning, make the brief self-contained for the subagent:
- State the exact question(s) it must answer.
- Give the context for how the answer will be used (so it tailors the synthesis).
- Set the scope (narrow vs broad), the depth (`quick` / `standard` / `deep`, default `standard`), and any sources to prefer or avoid.
- Say whether to save the result to `research/` (and suggest a slug) or just return it.

Require the subagent to meet its grounding Definition of Done — every claim sourced (URL + title + date), verified-vs-inferred separated, recency noted, confidence and gaps stated, no fabricated citations. When it returns, relay the actionable answer and the path to any saved note. Do not discard its findings or silently fall back to answering from memory.
