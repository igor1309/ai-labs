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

## Langfuse is a shared service

The Langfuse stack lives at `docker/langfuse/` (repo root), not inside `web-scout/`. It is shared across projects. Always start the stack from the **same stable workspace where you intend to keep it running** (typically the repo root worktree, never a feature worktree). Bind-mount paths are frozen at `docker compose up` time — if the source workspace disappears, ClickHouse silently breaks.

## Start the stack

```bash
docker compose -f docker/langfuse/docker-compose.yml --env-file docker/langfuse/.env up -d
```

UI available at `http://localhost:3000`. Sign in with `LANGFUSE_INIT_USER_EMAIL` / `LANGFUSE_INIT_USER_PASSWORD` from `docker/langfuse/.env`.

## Verify the stack before running smoke tests

The container health check only probes ClickHouse TCP (port 9000) — it does **not** verify the HTTP API (port 8123) that Langfuse actually uses. A "healthy" container can still have a broken ClickHouse config. Always verify end-to-end before running smoke tests:

```bash
curl -sf http://localhost:3000/api/public/health | python3 -m json.tool
```

Expected: `{"status": "OK", ...}`. If you get `ECONNREFUSED 8123` or a 500 error, the ClickHouse bind-mount is stale — restart the stack (see below).

## Stop the stack

```bash
docker compose -f docker/langfuse/docker-compose.yml down
```

## Troubleshooting: stale ClickHouse bind-mount

ClickHouse config files are bind-mounted from `docker/langfuse/clickhouse-config/`. The mount path is resolved at `docker compose up` time and frozen into the container. If the stack was started from a different worktree (or the worktree was deleted), ClickHouse silently loses its config and falls back to loopback-only on port 8123. Symptoms:

- Container reports `healthy` (TCP 9000 still works)
- Langfuse traces API returns `500: ECONNREFUSED 8123`
- Smoke test runs but traces never appear in Langfuse UI

**Fix:** restart the stack from the repo root:

```bash
docker compose -f docker/langfuse/docker-compose.yml --env-file docker/langfuse/.env down
docker compose -f docker/langfuse/docker-compose.yml --env-file docker/langfuse/.env up -d
```

**Verify the mount source is correct:**

```bash
docker inspect langfuse-clickhouse-1 --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}{{end}}{{end}}'
```

The path must point to `<repo-root>/docker/langfuse/clickhouse-config`, not a worktree path.

**Teardown order when using worktrees:** stop the stack before removing the worktree, not after.
