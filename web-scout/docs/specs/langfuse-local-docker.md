---
date: 2026-03-03
model: claude-sonnet-4-6
description: "Spec: Langfuse local Docker Compose stack for web-scout"
---

# Langfuse Local Docker Stack

## Goal

Provide a self-contained Langfuse v3 Docker stack for the web-scout project, pre-bootstrapped with a project and API keys from a local env file, owned by the web-scout project.

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
| `LANGFUSE_SALT` | Random string for Langfuse internal salting |
| `LANGFUSE_ENCRYPTION_KEY` | 64-character hex key for Langfuse encryption |
| `LANGFUSE_NEXTAUTH_SECRET` | Secret for NextAuth session signing |
| `LANGFUSE_DB_PASSWORD` | Postgres password |
| `LANGFUSE_REDIS_AUTH` | Redis password |
| `LANGFUSE_CLICKHOUSE_PASSWORD` | ClickHouse password |
| `LANGFUSE_MINIO_PASSWORD` | MinIO root password |
| `LANGFUSE_INIT_ORG_ID` | Fixed UUID for the bootstrap organisation |
| `LANGFUSE_INIT_ORG_NAME` | Bootstrap organisation display name |
| `LANGFUSE_INIT_PROJECT_ID` | Fixed UUID for the bootstrap project |
| `LANGFUSE_INIT_PROJECT_NAME` | Bootstrap project display name |
| `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` | Langfuse public key for the bootstrap project |
| `LANGFUSE_INIT_PROJECT_SECRET_KEY` | Langfuse secret key for the bootstrap project |
| `LANGFUSE_INIT_USER_EMAIL` | Admin user login email |
| `LANGFUSE_INIT_USER_NAME` | Admin user display name |
| `LANGFUSE_INIT_USER_PASSWORD` | Admin user password |

The public and secret keys exposed by the bootstrap project are consumable as `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` by external clients (e.g. `smoke.py`).

## Behavior rules

1. Compose file lives at `web-scout/docker/langfuse/docker-compose.yml` and is committed to the repo.
2. All secrets are injected via env var substitution from `web-scout/.env`; no secret is hardcoded in the compose file.
3. On first `up`, `langfuse-web` bootstraps the org, project, and admin user from `LANGFUSE_INIT_*` vars.
4. `langfuse-web` (port 3000) only starts after postgres, clickhouse, redis, and minio pass their health checks.
5. `LANGFUSE_BASE_URL` in `web-scout/.env` is set to `http://localhost:3000` when using the local stack.
6. No Langfuse telemetry is sent to external hosts by default.
7. All services except `langfuse-web` (3000) and minio (9090) are bound to `127.0.0.1` only.

## Tests

1. `allServicesHealthy` — after `docker compose up -d`, all 6 services report `healthy` or `running`.
2. `healthEndpointOk` — `GET /api/public/health` returns `{"status":"ok"}`.
3. `bootstrapProjectReachable` — the bootstrap project is reachable via the Langfuse API using `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` and `LANGFUSE_INIT_PROJECT_SECRET_KEY`.
4. `noSecretHardcoded` — the compose file contains no literal password or key values; all values are env-var references.
5. `externalTrafficIsolated` — all services except `langfuse-web` (3000) and minio (9090) bind only to `127.0.0.1`.
6. `bootstrapTrace` — a trace created with the bootstrap keys appears in the Langfuse API response for the bootstrap project.

## Done criteria

`docker compose up -d` starts the stack; all 6 services are healthy; UI is reachable; the bootstrap project and API keys are active; a test trace sent with those keys appears in the Langfuse UI.
