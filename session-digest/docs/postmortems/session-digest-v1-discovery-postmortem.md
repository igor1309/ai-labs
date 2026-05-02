---
date: 2026-04-27
model: gpt-5
description: "Postmortem for the failed session-digest V1 Deep Agents discovery path."
---

# Session Digest V1 Discovery Postmortem

## Summary

V1 failed as a product architecture, but it succeeded as a discovery path. The original design intentionally constrained the tool to one Claude Code JSONL file, one model, one Deep Agents run, and exactly three subagents. Those constraints made the prototype cheap to implement and easy to probe, but real sessions exposed that the architecture does not scale to the data shape the tool needs to understand.

The failure is not simply that one provider or one model was weak. The core failure is that V1 sends the wrong material to the model in the wrong shape. It either degrades the session by flattening away structure, or preserves raw structure and then exceeds practical request limits before the model's advertised context window becomes useful.

## What V1 Proved

- The CLI surface is useful: one local session file in, one Markdown digest out.
- Project-scoped provider routing through Nomos works and records usage under the `session-digest` project.
- `x-ai/grok-4.1-fast` through Nomos can produce useful output for small and mid-size sessions.
- NVIDIA NIM models probed during this window were not reliable for the agentic digest workload.
- Deep Agents can orchestrate fixed role subagents, but task delegation duplicates payloads and adds request overhead.
- A 2M-token model context does not remove provider, proxy, request-body, timeout, and tool-loop limits.

## What Failed

### Lossy Session Parsing

The current parser reduces Claude JSONL records to `{ role, content }`. That loses the information most relevant to a session postmortem:

- tool calls and tool results;
- command names and outputs;
- file paths and edited artifacts;
- timestamps, UUIDs, and parent-child relationships;
- error/retry sequences;
- commits and verification steps;
- evidence anchors tied to exact records.

This flattened transcript is smaller than raw JSONL, but it is smaller for the wrong reason: it strips the structure needed to produce a high-value digest.

### Raw Pass-Through Is Not Viable

Sending raw JSONL preserves more information, but a throwaway raw pass-through run for a `484229` byte iOS session failed with `413 "request entity too large"` through the current Deep Agents path. The problem appears before the model can use its large context window.

The current path also tells each task call to include the full transcript JSON, so larger sessions are multiplied across the parent agent and subagent calls. This makes request size and timeout behavior worse as the session grows.

### Linear Three-Subagent Orchestration Is the Wrong Unit

The V1 role split assumes each subagent should see the whole session and produce its owned sections. Real sessions need a different unit of work. A useful digest needs a compact representation of what happened, not three independent attempts to reason over the same raw material.

## Strategic Lesson

The V1 probe shows that useful session digestion cannot start with either lossy text flattening or raw full-session delegation. The next design needs a new ADR because ADR-001's core constraints no longer match the observed workload.

The postmortem does not choose the replacement architecture. That decision belongs in a separate V2 design discussion.
