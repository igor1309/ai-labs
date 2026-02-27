# E2E Local Deploy Test

Validates the full Nomos Docker Compose stack (Nomos + Caddy reverse proxy) end-to-end on a local machine.

## Prerequisites

- **Docker runtime**: [OrbStack](https://orbstack.dev) (recommended for macOS) or Docker Desktop
- **Port 8180 free** on the host (the e2e stack uses port 8180 to avoid conflicts with the production compose on port 80)

Verify Docker is running:

```bash
docker info
```

## Run

From the repo root:

```bash
RUN_NOMOS_E2E=1 node --test nomos/tests/e2e-local-deploy.test.js
```

## What it does

The test is fully self-contained. On each run it:

1. **Creates `.env.e2e`** in `nomos/` with stub-enabled config (no vendor API key needed)
2. **Builds and starts** the isolated stack via `docker compose -f docker-compose.e2e.yml -p nomos-e2e up -d --build --wait`
3. **Seeds** a stub-scoped project into the SQLite database (via `docker cp` + `docker exec`)
4. **Runs 8 tests** against `http://127.0.0.1:8180`:
   - Containers are running and healthy
   - Health check through Caddy reverse proxy (200)
   - Auth rejects missing bearer token (401)
   - Auth rejects invalid token (401)
   - Stub non-streaming chat completion through full stack (200)
   - Stub streaming through Caddy delivers unbuffered SSE (200)
   - Unknown route returns 404
   - Missing model returns 400
5. **Tears down** the stack (`docker compose down -v`) and deletes `.env.e2e`

## Isolation

The e2e compose file (`docker-compose.e2e.yml`) is fully isolated from the production `docker-compose.yml`:

| | Production | E2E |
|---|---|---|
| Compose file | `docker-compose.yml` | `docker-compose.e2e.yml` |
| Project name | `nomos` (default) | `nomos-e2e` |
| Container names | `nomos`, `nomos-caddy` | `nomos-e2e`, `nomos-e2e-caddy` |
| Host port | 80 | 8180 |
| Volumes | `nomos-data`, `caddy-data`, `caddy-config` | `nomos-e2e-data`, `caddy-e2e-data`, `caddy-e2e-config` |
| Env file | `.env` | `.env.e2e` (auto-generated) |
| Fixtures | not mounted | `tests/fixtures` bind-mounted read-only |

## Troubleshooting

**Port 8180 already in use:**

```bash
lsof -i :8180
```

Kill the conflicting process or change the port in `docker-compose.e2e.yml`.

**Stale containers from a crashed test run:**

```bash
cd nomos
docker compose -f docker-compose.e2e.yml -p nomos-e2e down -v
rm -f .env.e2e .e2e-seed.mjs
```

**Docker not found:**

Install [OrbStack](https://orbstack.dev) (macOS) or [Docker Desktop](https://www.docker.com/products/docker-desktop/). Ensure the Docker daemon is running.

**Tests skipped:**

Without `RUN_NOMOS_E2E=1`, all 8 tests are skipped with the message: `Set RUN_NOMOS_E2E=1 to run local deploy e2e tests.` This is intentional — the e2e tests require Docker and are not part of the normal CI test suite.
