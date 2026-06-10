# docker/langfuse

Shared [Langfuse](https://langfuse.com) v3 instance for LLM tracing and cost tracking across ai-labs projects.

## Stack

Defined in `docker-compose.yml`:

- **langfuse-web** — UI and API (`langfuse/langfuse:3`), exposed on port `3000`
- **langfuse-worker** — async ingestion worker (`langfuse/langfuse-worker:3`)
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
