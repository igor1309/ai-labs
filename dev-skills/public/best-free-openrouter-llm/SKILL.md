---
name: best-free-openrouter-llm
author: Igor Malyarov
version: "1.0.0"
description: Use when the user wants to discover, refresh, or configure the current best free OpenRouter LLM (e.g. "what's the best free OpenRouter model right now", "set up my agent with a free model", "rotate today's free model"). Reads ranking metadata from shir-man.com and optionally emits OpenAI-compatible configuration for agents, CLIs, or scripts.
---

# Best Free OpenRouter LLM

Use this skill when the user wants to:

- discover the current best free OpenRouter model for agentic/coding usage
- configure a CLI, agent, or script with the current free OpenRouter model
- refresh a daily model selection without hardcoding a specific free model
- choose a fallback when the top free model is unavailable

This skill reads public ranking metadata from:

```text
https://shir-man.com/api/free-llm/top-models
```

It does not proxy user prompts or completions. User prompts should go directly to OpenRouter using the returned `baseUrl` and the user's own `OPENROUTER_API_KEY`.

## Contract

Input:

- optional `--json` flag: output machine-readable JSON
- optional `--env` flag: output shell exports
- optional `--no-fallback` flag: omit fallback model ID from text/env output
- optional `--min-confidence` value: require ranking confidence, default `medium`

Output:

- primary model ID from `models[0].id`
- OpenRouter base URL from `baseUrl`
- fallback model ID from `fallback.id`, normally `openrouter/free`, unless `--no-fallback` is set
- ranking metadata: `updatedAt`, `rankingVersion`, `rankingConfidence`, and `reason`

Failure behavior:

- If the ranking endpoint is unavailable, return a non-zero exit code.
- If no ranked model exists, return a non-zero exit code.
- If confidence is missing, unknown, or below the configured minimum, return a non-zero exit code unless the caller explicitly accepts low confidence.
- Do not invent a model ID. The only safe hardcoded fallback is `openrouter/free`.

## Usage

```bash
python3 scripts/best_free_openrouter_llm.py --env
```

Example output:

```bash
export OPENROUTER_BASE_URL='https://openrouter.ai/api/v1'
export OPENROUTER_MODEL='inclusionai/ling-2.6-1t:free'
export OPENROUTER_FALLBACK_MODEL='openrouter/free'
```

For JSON:

```bash
python3 scripts/best_free_openrouter_llm.py --json
```

## Agent setup pattern

1. Run the script once per day or at process startup.
2. Use `OPENROUTER_MODEL` as the active model.
3. Use `OPENROUTER_FALLBACK_MODEL` only when the active model fails due to availability/routing errors.
4. Send completions directly to OpenRouter:

```text
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer $OPENROUTER_API_KEY
Content-Type: application/json
```

Body:

```json
{
  "model": "$OPENROUTER_MODEL",
  "messages": [
    { "role": "user", "content": "Your task here" }
  ]
}
```

## Selection rule

Use `models[0]` as the primary model. The upstream service already ranks eligible free text models using metadata, health/latency checks, and a lightweight agent evaluation. Do not re-rank unless the user explicitly asks for a different policy.

## Safety and correctness notes

- Do not send user prompts to `shir-man.com`; it is only a ranking metadata source.
- Do not store or transmit `OPENROUTER_API_KEY` to the ranking endpoint.
- Do not claim this is a benchmark winner. Treat it as a practical daily heuristic.
- Free model availability and rate limits can vary.
- Prefer cached daily reads over calling the ranking endpoint for every completion.
