---
title: ADR-002 — Session Digest OpenAI-Compatible Provider Routing
date: 2026-04-26
status: accepted
model: gpt-5
version: 1.0
description: "Amends ADR-001 provider selection after NVIDIA NIM model probes stalled or failed the Deep Agents contract."
---

# ADR-002: Session Digest OpenAI-Compatible Provider Routing

## Status

Accepted.

## Context

ADR-001 intentionally constrained `session-digest` to NVIDIA NIM so the prototype could evaluate Deep Agents without provider portability work. Real probes changed that constraint:

- `deepseek-ai/deepseek-v4-pro` and `deepseek-ai/deepseek-v4-flash` timed out before returning usable output.
- `nvidia/nemotron-3-super-120b-a12b` supported a raw tool call quickly, but the full Deep Agents CLI run stalled.
- `moonshotai/kimi-k2-instruct` returned quickly, but Deep Agents routed through its default `general-purpose` task path and the digest sections were not generated.

The next useful experiment is still the same CLI and Deep Agents workflow, but with a cheap OpenAI-compatible endpoint that can be swapped without changing orchestration code.

## Decision

`session-digest` will build one `ChatOpenAI` client from configuration with these supported providers:

1. OpenRouter direct: `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`, base URL `https://openrouter.ai/api/v1`.
2. Nomos local proxy: `NOMOS_API_KEY`, `NOMOS_MODEL`, and optional `NOMOS_BASE_URL`, defaulting to `http://localhost:8080/v1`.
3. NVIDIA NIM legacy path: `NVIDIA_API_KEY` and `NVIDIA_MODEL`, base URL `https://integrate.api.nvidia.com/v1`.

When more than one complete provider key pair is present, selection order is OpenRouter, then Nomos, then NVIDIA NIM.

This is provider routing, not a provider abstraction layer. The code keeps one model constructor, one Deep Agents orchestration path, and one configured model for all subagents. There is no role-based model routing, fallback retry chain, vendor-specific client wrapper, or provider plugin interface.

## Consequences

- Digest front matter records the selected provider id and model.
- `.env.example` documents all supported provider key pairs.
- Shell proxy environment variables continue to apply to model requests through the injected fetch path.
- Local probes can compare `deepseek/deepseek-v3.2`, `x-ai/grok-4.1-fast`, and future cheap OpenRouter/Nomos candidates without another code change.
- ADR-001 remains authoritative for CLI shape, input limits, fixed sections, output persistence, and Deep Agents role ownership. Its NVIDIA-only provider invariant is superseded by this ADR.
