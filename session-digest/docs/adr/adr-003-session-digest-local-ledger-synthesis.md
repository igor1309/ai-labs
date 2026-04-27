---
title: ADR-003 — Session Digest Local Ledger and Bounded Synthesis
date: 2026-04-27
status: accepted
model: gpt-5
version: 0.1
description: "Supersedes the V1 full-session Deep Agents architecture with local Claude JSONL interpretation, versioned ledgers, and bounded model synthesis."
---

# ADR-003: Session Digest Local Ledger and Bounded Synthesis

## Status

Accepted.

## Executive Summary

ADR-003 replaces V1's full-session Deep Agents pipeline with local Claude JSONL interpretation, a persisted derived ledger, and bounded model synthesis. The change is driven by V1 evidence: lossy flattening removed essential session structure, while raw pass-through and full-session delegation exceeded practical request limits. V2 keeps the local CLI and ADR-002 provider routing, but moves session understanding into a versioned local compiler. The capable model receives a compact context derived from the ledger rather than raw JSONL. Raw input is still not copied or persisted.

## Context

ADR-001 intentionally constrained `session-digest` to a small exploration prototype: one Claude Code JSONL file, lossy message extraction, one Deep Agents run, and exactly three subagents. ADR-002 later superseded the NVIDIA-only provider decision after NVIDIA NIM probes were not reliable enough for the workload.

The V1 postmortem and compression probe changed the architecture constraints:

- Flattening Claude JSONL into `{ role, content }` removes tool calls, tool results, file paths, timestamps, errors, commits, and evidence anchors.
- Raw JSONL pass-through preserves structure but hit `413 "request entity too large"` through the current Deep Agents path on a real `484229` byte session.
- Full-session Deep Agents delegation multiplies payload size because parent and task calls resend the same session material.
- A real `1,536,754` byte Claude Code session was heuristically reducible to a `40,978` byte model-facing semantic context by local JSONL-aware compilation, without embeddings or an LLM.
- Once semantic compression is used, the local ledger becomes an essential artifact boundary and derived digests need compressor strategy/version metadata.

The product goal is not to minimize model calls. The product goal is to produce a valuable digest. A capable model should work on structured, compressed session context instead of raw transcript exhaust.

## Decision

V2 will replace the V1 full-session Deep Agents architecture with a local ledger and bounded synthesis architecture.

## Rules / Invariants

- **Surface**: keep a local CLI that accepts one Claude Code JSONL session path and writes digest artifacts under `~/.session-digests/`.
- **Provider routing**: keep ADR-002 OpenAI-compatible provider routing through Nomos, OpenRouter, and NVIDIA NIM legacy configuration.
- **Input interpretation**: parse Claude JSONL into a structured local event ledger. Do not flatten the session into only `{ role, content }`.
- **Evidence anchors**: every retained event or derived fact MUST preserve a stable source anchor, such as a record number or equivalent local reference.
- **Local semantic compression**: reduce raw session material locally by interpreting Claude Code record structure, linking related records, and replacing bulky machine output with typed facts.
- **Bounded model context**: send the capable model a compact model-facing context derived from the ledger, not raw JSONL and not the V1 flattened transcript.
- **Artifact reproducibility**: generated digests MUST record the compressor strategy identifier, compressor version, source size/counts, ledger size, and model-facing context size.
- **Ledger persistence**: the local ledger MUST be persisted as a derived artifact under `~/.session-digests/`. The V2 spec defines file format, location, and naming, but digest front matter MUST record the ledger artifact identity, compressor metadata, and derived context sizes.
- **Oversized input**: the V2 spec MUST define explicit overflow behavior for sessions that exceed the local compiler or bounded-context budget. ADR-003 removes ADR-001's `1 MB` cap, but it does not allow silent truncation or unbounded model input.
- **Raw input retention**: do not copy or persist the raw JSONL input unless a future ADR explicitly changes retention policy.

Deep Agents are no longer required as the central orchestrator. They MAY be used later over bounded role-specific artifacts, but V2 MUST NOT require each subagent to receive the full session.

## Local Ledger

The local ledger is a structured intermediate representation of the session. It should preserve enough data for digest synthesis and evidence checking while removing transport noise and duplicated tool output. A compressor strategy identifier is a stable string naming the compiler implementation, such as `claude-jsonl-v1`; the compressor version is a semver-style version for that strategy.

The ledger should capture, at minimum:

- session metadata, including source path or source identifier, source byte size, record count, and observable start/end timestamps when present;
- ordered record/event anchors;
- user requests and scope changes;
- assistant actions and plan changes;
- tool calls and tool results;
- command, test, and build outcomes;
- file and artifact references;
- error, retry, timeout, and failure chains;
- commits or verification milestones when present;
- unresolved questions, TODOs, or handoff notes when observable.

The exact schema is an implementation detail, but the schema MUST be versioned through the compressor strategy/version metadata.

Bounded role-specific artifacts, if introduced later, are views derived from the ledger or model-facing context for a specialized model pass. They are not a license to resend the full raw session to a role.

## Model Role

The capable model should synthesize value from the bounded context:

- write the session summary and outcome;
- distinguish useful decisions from incidental work;
- identify failure or friction points;
- propose next-session improvements;
- check whether non-obvious claims are backed by evidence anchors.

The model should not be responsible for rediscovering Claude Code session structure from raw JSONL.

## Consequences

### Positive

- Preserves the CLI workflow that already proved useful.
- Makes large sessions plausible without relying on advertised context-window size.
- Gives model calls higher-signal input and better evidence anchors.
- Makes output reproducibility diagnosable through compressor metadata.
- Keeps raw input retention conservative.

### Negative

- Adds a real local compiler component that must be tested and versioned.
- Moves the hard problem from prompt orchestration into session schema interpretation.
- Requires new fixtures and regression tests over Claude JSONL shapes.
- Makes V1 acceptance tests around flattened parsing and Deep Agents orchestration obsolete.

### Tradeoffs

This ADR chooses semantic compression over raw-context maximalism. The tradeoff is that local code must decide what raw material is worth preserving. That risk is acceptable because V1 showed raw-context delegation is not reliable at real session sizes, and the compression probe showed that much of the raw byte volume is structured tool output rather than human intent.

This ADR also chooses direct bounded synthesis as the main path. Deep Agents are not banned, but they are demoted from the core architecture until there is a proven bounded artifact for them to consume.

## Non-Goals

V2 does not decide:

- a multi-session index;
- watched-folder mode;
- an HTTP service;
- embeddings as a required dependency;
- raw JSONL retention;
- a generic transcript adapter for non-Claude sources;
- role-based model routing;
- exact ledger schema details;
- exact digest section changes.

Embeddings are explicitly deferred. They may become useful for retrieval over very large sessions or cross-session corpora, but the compression probe shows that schema-aware local compilation is enough to justify the first V2 step.

## Superseded ADR-001 Constraints

ADR-003 supersedes these ADR-001 constraints:

| ADR-001 constraint | ADR-003 replacement |
|---|---|
| Lossy best-effort message extraction into text messages | Structured Claude JSONL event ledger |
| Input limited to `<=1 MB` because no compression exists | Larger sessions handled by local semantic compression, with concrete limits and overflow behavior set in the V2 spec |
| Deep Agents are the sole orchestrator | Local compiler plus bounded model synthesis is the core path |
| Exactly three full-session subagents | Role-based passes are optional and must consume bounded artifacts |
| Generated Markdown digest is the only persisted artifact | Digest remains required; the derived local ledger is also persisted, and derived artifacts must record compressor metadata |

ADR-001 remains useful historical context for the CLI surface, local-only posture, fixed digest artifact goal, and raw-input non-retention unless superseded by a later ADR.

## Related

- [ADR-001: Session Digest Exploration Prototype with Deep Agents and NVIDIA NIM](adr-001-session-digest-deepagents-nim.md)
- [ADR-002: Session Digest OpenAI-Compatible Provider Routing](adr-002-session-digest-openai-compatible-routing.md)
- [Session Digest V1 Discovery Postmortem](../postmortems/session-digest-v1-discovery-postmortem.md)
- [Session Compression Probe](../research/session-compression-probe.md)
