---
date: 2026-03-03
model: claude-opus-4-6
description: "Spec: promote Langfuse from web-scout-local to shared ai-labs infrastructure"
---

# Spec: Shared Langfuse stack

## Goal

Promote the Langfuse Docker stack from `web-scout/docker/langfuse/` to shared repo-level infrastructure at `docker/langfuse/`, so any ai-labs project can send traces to a single local Langfuse instance.

## Public interface

### Start/stop

```bash
docker compose -f docker/langfuse/docker-compose.yml --env-file docker/langfuse/.env up -d
docker compose -f docker/langfuse/docker-compose.yml down
```

UI at `http://localhost:3000`.

### Per-project configuration

Each project that wants Langfuse tracing sets three env vars (in its own `.env` or equivalent):

| Variable | Description |
|---|---|
| `LANGFUSE_PUBLIC_KEY` | Project-scoped public key from the Langfuse UI |
| `LANGFUSE_SECRET_KEY` | Project-scoped secret key from the Langfuse UI |
| `LANGFUSE_BASE_URL` | `http://localhost:3000` |

Projects create their own Langfuse project via the UI (or bootstrap config) and use project-scoped keys. The shared stack provides the infrastructure; projects own their own traces.

## Components

### `docker/langfuse/`

Relocated from `web-scout/docker/langfuse/`. Same 6-service compose (postgres, redis, clickhouse, minio, langfuse-worker, langfuse-web).

#### `docker/langfuse/.env`

Contains only stack infrastructure secrets (DB passwords, Redis auth, ClickHouse password, Minio credentials, NextAuth secret, encryption key, salt). Does **not** contain project-scoped Langfuse API keys — those belong in each project's `.env`.

Gitignored. A `.env.example` is committed with placeholder values documenting every required variable.

#### `docker/langfuse/docker-compose.yml`

Unchanged from current `web-scout/docker/langfuse/docker-compose.yml` except path references adjusted for the new location.

### Bootstrap configuration

The compose file supports optional bootstrap env vars for first-run setup:

| Variable | Description |
|---|---|
| `LANGFUSE_INIT_ORG_ID` | Auto-create org on first boot |
| `LANGFUSE_INIT_ORG_NAME` | Org display name |
| `LANGFUSE_INIT_PROJECT_ID` | Auto-create first project |
| `LANGFUSE_INIT_PROJECT_NAME` | Project display name |
| `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` | Pre-set public key for first project |
| `LANGFUSE_INIT_PROJECT_SECRET_KEY` | Pre-set secret key for first project |
| `LANGFUSE_INIT_USER_EMAIL` | Admin user email |
| `LANGFUSE_INIT_USER_NAME` | Admin user display name |
| `LANGFUSE_INIT_USER_PASSWORD` | Admin user password |

These are optional — if omitted, Langfuse shows its normal signup flow. When bootstrapping multiple projects, create additional projects via the UI after first boot.

### `web-scout/.env` migration

Remove all `LANGFUSE_*` stack variables (DB passwords, Redis auth, etc.) from `web-scout/.env`. Keep only the three client vars (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`).

Update `web-scout/docs/langfuse.md` to point at the shared stack location.

## Behavior rules

1. The shared stack runs independently of any project — starting it does not require any project to be built or configured.
2. Projects are isolated by Langfuse project-scoped API keys. One project's traces are not visible to another.
3. The stack `.env` contains only infrastructure secrets. Project API keys live in each project's own `.env`.
4. `docker/langfuse/.env` is gitignored. `docker/langfuse/.env.example` is committed.
5. The bind-mount warning applies: start the stack from a stable workspace, not a feature worktree.
6. Stack start/stop commands work from the repo root without `cd`.
7. No code changes to any project's Langfuse client — only the stack location and `.env` content distribution changes.

## Tests

Static (CI-safe, no running stack required):

1. `docker/langfuse/.env.example` exists and documents all required variables.
2. `docker/langfuse/.env.example` contains no real secrets (all values are placeholders).
3. `docker/langfuse/docker-compose.yml` exists and is valid YAML.
4. `docker/langfuse/docker-compose.yml` binds only to `localhost` (no `0.0.0.0` port mappings for external-facing services).
5. `web-scout/.env` does not contain `LANGFUSE_DB_PASSWORD`, `LANGFUSE_REDIS_AUTH`, or other stack infrastructure secrets.

Integration (requires running stack):

6. All 6 services are healthy after `docker compose up -d`.
7. Langfuse UI responds at `http://localhost:3000`.
8. A trace sent with project-scoped keys is visible in the Langfuse UI.

## Done criteria

- `docker/langfuse/` contains the compose file, `.env` (gitignored), and `.env.example` (committed).
- `web-scout/docker/langfuse/` is removed.
- `web-scout/.env` contains only the three Langfuse client vars.
- `web-scout/docs/langfuse.md` updated to reference shared stack path.
- All static tests pass. Integration tests pass against the running stack.
- Existing web-scout smoke run with Langfuse produces traces in the shared stack.
