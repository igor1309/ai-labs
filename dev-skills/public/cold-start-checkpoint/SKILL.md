---
name: cold-start-checkpoint
author: Igor Malyarov
version: "1.2.0"
description: >
  Use on the first user message of every new session — before any tool use,
  file reads, or repo exploration. Forces a brief understanding replay so the
  user can catch misinterpretations before execution begins. When the request points
  to a handoff/ADR/research/plan, read every doc it references before any live tool use.
---

# Cold Start Checkpoint Protocol

**Announce:** "Pausing to confirm I understand before diving in."

## Step 1 — Summarize (no tools)

Without using any tools, formulate a **2-3 sentence summary** of the user's request. Be specific — name files, modules, behaviors if mentioned. Flag anything ambiguous.

## Step 2 — Present the checkpoint

Output this block:

```
## Cold Start Checkpoint

**My understanding:** [2-3 sentence summary]

**Assumptions I'm making:**
- [assumption 1]
- [assumption 2]
- ...

**What would you like to do?**
1. Go — understanding is correct, proceed
2. Clarify — let me ask a few questions first
3. Restate — let me re-explain what I need
```

Keep it brutally short. No preamble, no meta-commentary. 3-5 assumptions max — only ones that would derail execution if wrong.

For crystal-clear, single-scoped prompts (e.g., "bump version to 2.1.0 in Package.swift"): one-sentence summary, skip assumptions, just show the Go/Clarify/Restate options.

## Step 3 — Branch on response

- **Go** (1, y, yes, ok, approve, proceed, lgtm): go to Step 4, then proceed with normal execution.
- **Clarify** (2, clarify, questions, q&a): ask 2-3 targeted questions about the ambiguities you identified. After answers, loop back to Step 2 with an updated summary.
- **Restate** (3, restate, let me re-explain, wait, no): acknowledge, wait for the user's restated prompt. Treat the new prompt as the real first message and loop back to Step 1.

## Step 4 — Ground from referenced docs (before any live/external tool use)

If the entry point is — or names — a handoff, ADR, research note, plan, or ticket, first enumerate **every** doc and path it references, then read those with file tools **before** any Bash/SSH/Web/MCP investigation.

- A dated, verified doc written against the current state *is* the grounding pass. Read what it references instead of re-deriving the facts live.
- Do **not** re-run grounding the doc already captures (e.g. re-spelunking a production host a handoff documents). Against production that is costly, not diligent.
- Re-verify live only when there is a concrete reason to suspect the doc is stale — and say what that reason is.

Only after the referenced docs are read does live/external investigation begin.
