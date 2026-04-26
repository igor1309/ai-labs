---
date: 2026-04-26
model: gpt-5
description: "Local usage notes for the session-digest CLI prototype."
---

# Session Digest

`session-digest` converts one Claude Code JSONL session into one Markdown digest under `~/.session-digests/`.

## Configuration

Create `~/.session-digests/.env`:

```bash
NVIDIA_API_KEY=...
NVIDIA_MODEL=deepseek-ai/deepseek-v4-pro
```

If the shell has `HTTPS_PROXY`, `HTTP_PROXY`, or `ALL_PROXY`, the CLI uses it automatically for NVIDIA NIM requests.

## Usage

From the repository root:

```bash
npx -w session-digest tsx src/cli.ts /absolute/path/to/session.jsonl
```

From another directory, pass the repository root explicitly:

```bash
npm --prefix /Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs.worktrees/deep-nvidia exec -w session-digest -- tsx src/cli.ts /absolute/path/to/session.jsonl
```

For this worktree's current Claude session:

```bash
npm --prefix /Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs.worktrees/deep-nvidia exec -w session-digest -- tsx src/cli.ts /Users/igormalyarov/.claude/projects/-Users-igormalyarov-Developer-my-apps-ai-labs-ai-labs-worktrees-deep-nvidia/44c1e8f1-3515-4e9e-a7c1-99151cbf657a.jsonl
```

On success, stdout contains only the generated digest path.
