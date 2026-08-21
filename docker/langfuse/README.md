# docker/langfuse

Shared [Langfuse](https://langfuse.com) v4 instance for LLM tracing and cost tracking across ai-labs projects.

## Stack

Defined in `docker-compose.yml`:

- **langfuse-web** — UI and API (`langfuse/langfuse:4`), exposed on port `3000`
- **langfuse-worker** — async ingestion worker (`langfuse/langfuse-worker:4`)
- **postgres** — primary application database
- **clickhouse** — analytics/event store (config in `clickhouse-config/`)
- **redis** — queue and cache
- **minio** — S3-compatible object storage for event and media uploads

All service ports except the web UI and MinIO console bind to `127.0.0.1` only.

## Usage

```bash
# Configure secrets first
cp docker/langfuse/.env.example docker/langfuse/.env   # then fill in real values

# Start
docker compose -f docker/langfuse/docker-compose.yml --env-file docker/langfuse/.env up -d

# Stop
docker compose -f docker/langfuse/docker-compose.yml down

# Full reset (drops volumes)
docker compose -f docker/langfuse/docker-compose.yml down -v
```

The web UI is then available at `http://localhost:3000`.

## Configuration

All secrets and bootstrap values come from `docker/langfuse/.env` (never committed).
See `.env.example` for the required keys — database/redis/clickhouse/minio
credentials, `SALT`, `ENCRYPTION_KEY`, NextAuth secrets, and optional
`LANGFUSE_INIT_*` values to auto-provision an org/project/user on first boot.

Telemetry to Langfuse Cloud is disabled (`TELEMETRY_ENABLED=false`).

## v4 migration state

The stack runs Langfuse v4 with the migration still in progress:

- `LANGFUSE_MIGRATION_V4_WRITE_MODE: dual` — ingestion writes both the v3 and v4
  tables, so the v3 read path keeps working. `legacy` and `dual` are migration
  utilities that a future major version removes; the end state is `events_only`.
- `LANGFUSE_BACKGROUND_MIGRATION_V4_ENABLE_HISTORIC_BACKFILL: "false"` — existing
  history is not backfilled into the new tables.

**Upgrade ClickHouse before the server.** The upstream guide requires the two
steps be sequenced — v3 runs fine against ClickHouse 26.4, v4 does not run
against 24.12. Bringing this compose file up in one `up -d` does both at once.
On an existing volume, start ClickHouse alone and let it settle first:

```bash
docker compose -f docker/langfuse/docker-compose.yml up -d clickhouse
# once healthy:
docker compose -f docker/langfuse/docker-compose.yml up -d
```

A fresh stack with no existing data can skip that and start everything together.

See the [v3 → v4 upgrade guide](https://langfuse.com/self-hosting/upgrade/upgrade-guides/upgrade-v3-to-v4).
