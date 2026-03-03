---
date: 2026-03-03
model: claude-sonnet-4-6
description: "Spec: Langfuse local Docker Compose stack for web-scout"
---

# Langfuse Local Docker Stack

## Goal

Commit a Docker Compose file that brings up a self-contained Langfuse v3 instance locally, pre-bootstrapped with a `web-scout` project and API keys sourced from `web-scout/.env`, so `docker compose up -d` is the only manual step.

## Public interface

```bash
# Start
docker compose -f web-scout/docker/langfuse/docker-compose.yml --env-file web-scout/.env up -d

# Stop
docker compose -f web-scout/docker/langfuse/docker-compose.yml down

# Destroy volumes (full reset)
docker compose -f web-scout/docker/langfuse/docker-compose.yml down -v
```

UI at `http://localhost:3000`.

### New env vars in `web-scout/.env`

| Variable | Description |
|---|---|
| `LANGFUSE_SALT` | Random string — `openssl rand -hex 16` |
| `LANGFUSE_ENCRYPTION_KEY` | 64-char hex — `openssl rand -hex 32` |
| `LANGFUSE_NEXTAUTH_SECRET` | Random string — `openssl rand -hex 16` |
| `LANGFUSE_DB_PASSWORD` | Postgres password |
| `LANGFUSE_REDIS_AUTH` | Redis password |
| `LANGFUSE_CLICKHOUSE_PASSWORD` | ClickHouse password |
| `LANGFUSE_MINIO_PASSWORD` | MinIO root password |
| `LANGFUSE_INIT_ORG_ID` | Fixed UUID for the bootstrap org |
| `LANGFUSE_INIT_ORG_NAME` | e.g. `web-scout` |
| `LANGFUSE_INIT_PROJECT_ID` | Fixed UUID for the bootstrap project |
| `LANGFUSE_INIT_PROJECT_NAME` | e.g. `smoke` |
| `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` | `pk-lf-...` — `openssl rand -hex 16` |
| `LANGFUSE_INIT_PROJECT_SECRET_KEY` | `sk-lf-...` — `openssl rand -hex 16` |
| `LANGFUSE_INIT_USER_EMAIL` | Admin login email |
| `LANGFUSE_INIT_USER_NAME` | Admin display name |
| `LANGFUSE_INIT_USER_PASSWORD` | Admin password |

`LANGFUSE_INIT_PROJECT_PUBLIC_KEY` and `LANGFUSE_INIT_PROJECT_SECRET_KEY` are also used as `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` by `smoke.py` — same `.env` file, no duplication.

## Behavior rules

1. Compose file lives at `web-scout/docker/langfuse/docker-compose.yml` and is committed to the repo.
2. All secrets are injected via env var substitution from `web-scout/.env`; no secret is hardcoded in the compose file.
3. On first `up`, `langfuse-web` bootstraps the org, project, and admin user from `LANGFUSE_INIT_*` vars.
4. `langfuse-web` (port 3000) only starts after postgres, clickhouse, redis, and minio pass their health checks.
5. `LANGFUSE_BASE_URL` in `web-scout/.env` is set to `http://localhost:3000`.
6. `TELEMETRY_ENABLED` defaults to `false` in the committed compose file.
7. All services except `langfuse-web` (3000) and minio (9090) are bound to `127.0.0.1` only.

## Verification steps

1. `docker compose -f web-scout/docker/langfuse/docker-compose.yml ps` — all 6 services show `healthy` or `running`.
2. `curl -s http://localhost:3000/api/public/health` returns `{"status":"ok"}`.
3. Browser login at `http://localhost:3000` with `LANGFUSE_INIT_USER_EMAIL` / `LANGFUSE_INIT_USER_PASSWORD` succeeds.
4. Project `smoke` appears in the UI under the `web-scout` org.
5. A minimal Python snippet using `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` / `SECRET_KEY` sends a test trace that appears in the UI.

## Done criteria

`docker compose up -d` starts the stack; all 6 services are healthy; UI is reachable; the bootstrap project and API keys are active; a test trace sent with those keys appears in the Langfuse UI.
