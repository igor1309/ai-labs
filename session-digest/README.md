---
date: 2026-04-26
model: gpt-5
description: "Local usage notes for the session-digest CLI prototype."
---

# Session Digest

`session-digest` converts one Claude Code JSONL session into one Markdown digest under `~/.session-digests/`.

## Configuration

Create `~/.session-digests/.env`:

For direct OpenRouter:

```bash
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=x-ai/grok-4.1-fast
```

For a local Nomos proxy:

```bash
NOMOS_API_KEY=...
NOMOS_MODEL=deepseek/deepseek-v3.2
NOMOS_BASE_URL=http://localhost:8080/v1
```

For the legacy NVIDIA NIM path:

```bash
NVIDIA_API_KEY=...
NVIDIA_MODEL=moonshotai/kimi-k2-instruct
```

Optional digest schema override:

```bash
SESSION_DIGEST_SCHEMA_PATH=/absolute/path/to/digest-schema.yaml
```

If omitted, the CLI uses `session-digest/digest-schema.yaml`.

If more than one provider is configured, the CLI uses Nomos first, then OpenRouter, then NVIDIA NIM.

If the shell has `HTTPS_PROXY`, `HTTP_PROXY`, or `ALL_PROXY`, the CLI uses it automatically for model requests.

Optional non-secret settings live in `~/.session-digests/settings.env`:

```bash
MODEL_CONTEXT_MAX_BYTES=250000
```

For a one-off run, `SESSION_DIGEST_MODEL_CONTEXT_MAX_BYTES` overrides `MODEL_CONTEXT_MAX_BYTES`.

For Nomos mode, start the local proxy from the repository root before running `session-digest`:

```bash
set -a; source nomos/.env; set +a; npm start -w nomos
```

## Usage

From the repository root:

```bash
npx -w session-digest tsx src/cli.ts /absolute/path/to/session.jsonl
```

To compile only the derived ledger without provider configuration or model synthesis:

```bash
npx -w session-digest tsx src/cli.ts --ledger-only /absolute/path/to/session.jsonl
```

From another directory, pass the repository root explicitly:

```bash
npm --prefix /Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs.worktrees/deep-nvidia exec -w session-digest -- tsx src/cli.ts /absolute/path/to/session.jsonl
```

For this worktree's current Claude session:

```bash
npm --prefix /Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs.worktrees/deep-nvidia exec -w session-digest -- tsx src/cli.ts /Users/igormalyarov/.claude/projects/-Users-igormalyarov-Developer-my-apps-ai-labs-ai-labs-worktrees-deep-nvidia/44c1e8f1-3515-4e9e-a7c1-99151cbf657a.jsonl
```

On success, stdout contains only the generated digest path. In `--ledger-only` mode, stdout contains only the generated ledger path.

## Description

A CLI prototype that turns one Claude Code JSONL session into a Markdown digest under `~/.session-digests/` — powered by configurable OpenAI-compatible model providers (Nomos, OpenRouter, or legacy NVIDIA NIM). Early-stage design.

## Stack

- TypeScript
- LangChain
- Nomos
- OpenRouter
- NVIDIA NIM
