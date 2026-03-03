---
date: 2026-03-03
model: claude-opus-4-6
description: "Langfuse observability: optional local tracing for web-scout smoke runs"
---

# Langfuse observability

Optional local tracing for smoke runs. When `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL` are set, each run produces one trace in Langfuse. All three values are pre-filled in `web-scout/.env`.

## How it works

Each smoke run creates a span tree:

```
web-scout-smoke
├── scout-agent
│   └── mcp-search
└── judge-agent
```

When the Langfuse env vars are absent, tracing is skipped with no behavioural change.

## Start the stack

```bash
docker compose -f web-scout/docker/langfuse/docker-compose.yml --env-file web-scout/.env up -d
```

UI available at `http://localhost:3000`. Sign in with `LANGFUSE_INIT_USER_EMAIL` / `LANGFUSE_INIT_USER_PASSWORD` from `web-scout/.env`.

## Stop the stack

```bash
docker compose -f web-scout/docker/langfuse/docker-compose.yml down
```

## Bind-mount warning

Always start the stack from the **same workspace tree where you intend to keep it running**. Bind-mount paths (e.g. `./clickhouse-config`) are resolved relative to the compose file at `docker compose up` time and frozen into the container. If that source path later disappears — for example because the git worktree it lived in was deleted — ClickHouse silently loses its config and falls back to loopback-only on port 8123. The container health check (TCP port 9000) still passes, masking the breakage.

**Teardown order when using worktrees:** stop the stack before removing the worktree, not after.
