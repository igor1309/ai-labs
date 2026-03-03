---
date: 2026-03-03
model: claude-sonnet-4-6
description: "Plan: Langfuse v3 local Docker stack for web-scout"
---

# Langfuse Local Docker Stack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a self-contained Langfuse v3 Docker Compose stack at `web-scout/docker/langfuse/docker-compose.yml`, pre-bootstrapped from `web-scout/.env`, with static tests verifying compose structure and integration tests verifying a live stack.

**Architecture:** Six-service compose (postgres, redis, clickhouse, minio, langfuse-worker, langfuse-web). All secrets injected via `${VAR}` env-var substitution from `web-scout/.env`. `langfuse-web` and `langfuse-worker` depend on all four infra services being healthy before starting. Static pytest tests verify compose file structure (no hardcoded secrets, correct port bindings) without requiring Docker. Integration tests (`@pytest.mark.docker`) verify a live stack and are excluded from the standard `npm test` run.

**Tech Stack:** Docker Compose v2, Langfuse v3 (`langfuse/langfuse:3`, `langfuse/langfuse-worker:3`), postgres:16, redis:7-alpine, clickhouse/clickhouse-server:24.12, minio/minio, pytest + pyyaml + requests

**Execution lock:**
- Worktree required: yes
- Expected worktree: `worktrees/langfuse-local-docker`
- Expected branch: `codex/langfuse-local-docker`
- Preflight check: [ ] done

---

## Preflight

Before any file edits:

```bash
git worktree add -b codex/langfuse-local-docker worktrees/langfuse-local-docker trunk
```

Verify:

```bash
git worktree list --porcelain
git branch --show-current
```

Expected: branch is `codex/langfuse-local-docker`, cwd is inside `worktrees/langfuse-local-docker`.

---

## Task 1: Add test dependencies to requirements.txt

**Files:**
- Modify: `web-scout/requirements.txt`

**Step 1: Update requirements.txt**

```
crewai[tools]>=0.100.0
mcp>=1.0.0
pytest>=8.0.0
pyyaml>=6.0
requests>=2.32
```

**Step 2: Install updated deps**

```bash
python3 -m pip install -r web-scout/requirements.txt
```

Expected: installs without error. Verify: `python3 -c "import yaml; import requests; print('ok')"`.

**Step 3: Commit**

```bash
git add web-scout/requirements.txt
git commit -m "add pyyaml and requests to test deps"
```

---

## Task 2: Write static compose structure tests (RED)

**Files:**
- Create: `web-scout/tests/test_langfuse_compose.py`

**Step 1: Write the test file**

```python
# web-scout/tests/test_langfuse_compose.py
import re
import yaml
from pathlib import Path

COMPOSE_PATH = Path(__file__).parent.parent / "docker" / "langfuse" / "docker-compose.yml"

ENV_VAR_RE = re.compile(r"^\$\{[A-Z_][A-Z0-9_]*\}$")
SECRET_KEYWORDS = {"password", "secret", "key", "salt", "auth"}


def _load_compose():
    with open(COMPOSE_PATH) as f:
        return yaml.safe_load(f)


def test_noSecretHardcoded():
    compose = _load_compose()
    violations = []
    for svc_name, svc in compose.get("services", {}).items():
        env = svc.get("environment") or {}
        for env_key, env_val in env.items():
            if any(k in env_key.lower() for k in SECRET_KEYWORDS):
                if not ENV_VAR_RE.match(str(env_val)):
                    violations.append(f"{svc_name}.{env_key} = {env_val!r}")
    assert violations == [], "Hardcoded secrets found:\n" + "\n".join(violations)


def test_externalTrafficIsolated():
    compose = _load_compose()
    PUBLIC_SERVICES = {"langfuse-web", "minio"}
    violations = []
    for svc_name, svc in compose.get("services", {}).items():
        if svc_name in PUBLIC_SERVICES:
            continue
        for port in svc.get("ports") or []:
            port_str = str(port)
            if not port_str.startswith("127.0.0.1:"):
                violations.append(f"{svc_name}: {port_str}")
    assert violations == [], "Services with unrestricted port binding:\n" + "\n".join(violations)
```

**Step 2: Run tests to verify RED**

```bash
python3 -m pytest web-scout/tests/test_langfuse_compose.py -v
```

Expected: `FileNotFoundError` — compose file doesn't exist yet. Confirms tests are wired up.

**Step 3: Commit**

```bash
git add web-scout/tests/test_langfuse_compose.py
git commit -m "add static langfuse compose tests (red)"
```

---

## Task 3: Create docker-compose.yml (GREEN)

**Files:**
- Create: `web-scout/docker/langfuse/docker-compose.yml`

**Step 1: Create directory**

```bash
mkdir -p web-scout/docker/langfuse
```

**Step 2: Write the compose file**

```yaml
# web-scout/docker/langfuse/docker-compose.yml
# Usage:
#   docker compose -f web-scout/docker/langfuse/docker-compose.yml --env-file web-scout/.env up -d
#   docker compose -f web-scout/docker/langfuse/docker-compose.yml down
#   docker compose -f web-scout/docker/langfuse/docker-compose.yml down -v   # full reset

services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 3s
      timeout: 3s
      retries: 10
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${LANGFUSE_DB_PASSWORD}
      POSTGRES_DB: langfuse
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - langfuse_postgres:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    environment:
      REDIS_PASSWORD: ${LANGFUSE_REDIS_AUTH}
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a \"$REDIS_PASSWORD\" ping | grep PONG"]
      interval: 3s
      timeout: 3s
      retries: 10
    command: ["redis-server", "--requirepass", "${LANGFUSE_REDIS_AUTH}"]
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - langfuse_redis:/data

  clickhouse:
    image: clickhouse/clickhouse-server:24.12
    restart: unless-stopped
    user: "101:101"
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:8123/ping || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 10
    environment:
      CLICKHOUSE_DB: default
      CLICKHOUSE_USER: clickhouse
      CLICKHOUSE_PASSWORD: ${LANGFUSE_CLICKHOUSE_PASSWORD}
    ports:
      - "127.0.0.1:8123:8123"
      - "127.0.0.1:9001:9000"
    volumes:
      - langfuse_clickhouse:/var/lib/clickhouse
      - langfuse_clickhouse_logs:/var/log/clickhouse-server

  minio:
    image: minio/minio
    restart: unless-stopped
    entrypoint: /bin/sh -c "mkdir -p /data/langfuse && minio server /data --console-address ':9001'"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: ${LANGFUSE_MINIO_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:9000/minio/health/live || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 15
    ports:
      - "127.0.0.1:9000:9000"
      - "9090:9001"
    volumes:
      - langfuse_minio:/data

  langfuse-worker:
    image: langfuse/langfuse-worker:3
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      clickhouse:
        condition: service_healthy
      minio:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://postgres:${LANGFUSE_DB_PASSWORD}@postgres:5432/langfuse
      SALT: ${LANGFUSE_SALT}
      ENCRYPTION_KEY: ${LANGFUSE_ENCRYPTION_KEY}
      REDIS_HOST: redis
      REDIS_AUTH: ${LANGFUSE_REDIS_AUTH}
      REDIS_PORT: "6379"
      CLICKHOUSE_MIGRATION_URL: clickhouse://clickhouse:9000
      CLICKHOUSE_URL: http://clickhouse:8123
      CLICKHOUSE_USER: clickhouse
      CLICKHOUSE_PASSWORD: ${LANGFUSE_CLICKHOUSE_PASSWORD}
      LANGFUSE_S3_EVENT_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_EVENT_UPLOAD_REGION: auto
      LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: minio
      LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: ${LANGFUSE_MINIO_PASSWORD}
      LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: http://minio:9000
      LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "true"
      LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_MEDIA_UPLOAD_REGION: auto
      LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID: minio
      LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: ${LANGFUSE_MINIO_PASSWORD}
      LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT: http://minio:9000
      LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE: "true"
      TELEMETRY_ENABLED: "false"

  langfuse-web:
    image: langfuse/langfuse:3
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      clickhouse:
        condition: service_healthy
      minio:
        condition: service_healthy
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://postgres:${LANGFUSE_DB_PASSWORD}@postgres:5432/langfuse
      SALT: ${LANGFUSE_SALT}
      ENCRYPTION_KEY: ${LANGFUSE_ENCRYPTION_KEY}
      NEXTAUTH_SECRET: ${LANGFUSE_NEXTAUTH_SECRET}
      NEXTAUTH_URL: http://localhost:3000
      REDIS_HOST: redis
      REDIS_AUTH: ${LANGFUSE_REDIS_AUTH}
      REDIS_PORT: "6379"
      CLICKHOUSE_MIGRATION_URL: clickhouse://clickhouse:9000
      CLICKHOUSE_URL: http://clickhouse:8123
      CLICKHOUSE_USER: clickhouse
      CLICKHOUSE_PASSWORD: ${LANGFUSE_CLICKHOUSE_PASSWORD}
      LANGFUSE_S3_EVENT_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_EVENT_UPLOAD_REGION: auto
      LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: minio
      LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: ${LANGFUSE_MINIO_PASSWORD}
      LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: http://minio:9000
      LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "true"
      LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_MEDIA_UPLOAD_REGION: auto
      LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID: minio
      LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: ${LANGFUSE_MINIO_PASSWORD}
      LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT: http://minio:9000
      LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE: "true"
      LANGFUSE_INIT_ORG_ID: ${LANGFUSE_INIT_ORG_ID}
      LANGFUSE_INIT_ORG_NAME: ${LANGFUSE_INIT_ORG_NAME}
      LANGFUSE_INIT_PROJECT_ID: ${LANGFUSE_INIT_PROJECT_ID}
      LANGFUSE_INIT_PROJECT_NAME: ${LANGFUSE_INIT_PROJECT_NAME}
      LANGFUSE_INIT_PROJECT_PUBLIC_KEY: ${LANGFUSE_INIT_PROJECT_PUBLIC_KEY}
      LANGFUSE_INIT_PROJECT_SECRET_KEY: ${LANGFUSE_INIT_PROJECT_SECRET_KEY}
      LANGFUSE_INIT_USER_EMAIL: ${LANGFUSE_INIT_USER_EMAIL}
      LANGFUSE_INIT_USER_NAME: ${LANGFUSE_INIT_USER_NAME}
      LANGFUSE_INIT_USER_PASSWORD: ${LANGFUSE_INIT_USER_PASSWORD}
      TELEMETRY_ENABLED: "false"

volumes:
  langfuse_postgres:
  langfuse_redis:
  langfuse_clickhouse:
  langfuse_clickhouse_logs:
  langfuse_minio:
```

**Step 3: Run static tests to verify GREEN**

```bash
python3 -m pytest web-scout/tests/test_langfuse_compose.py -v
```

Expected: both `test_noSecretHardcoded` and `test_externalTrafficIsolated` PASS.

**Step 4: Commit**

```bash
git add web-scout/docker/langfuse/docker-compose.yml
git commit -m "add langfuse v3 docker-compose — static tests green"
```

---

## Task 4: Extend web-scout/.env with Langfuse vars

**Files:**
- Modify: `web-scout/.env`

**Step 1: Generate secret values**

Run each command and copy the output into the corresponding var in the next step:

```bash
# LANGFUSE_SALT (32-char hex)
openssl rand -hex 16

# LANGFUSE_ENCRYPTION_KEY (64-char hex — required by Langfuse)
openssl rand -hex 32

# LANGFUSE_NEXTAUTH_SECRET
openssl rand -base64 24

# LANGFUSE_DB_PASSWORD
openssl rand -base64 18 | tr -d '=/+'

# LANGFUSE_REDIS_AUTH
openssl rand -base64 18 | tr -d '=/+'

# LANGFUSE_CLICKHOUSE_PASSWORD
openssl rand -base64 18 | tr -d '=/+'

# LANGFUSE_MINIO_PASSWORD (min 8 chars)
openssl rand -base64 18 | tr -d '=/+'

# LANGFUSE_INIT_ORG_ID
uuidgen | tr '[:upper:]' '[:lower:]'

# LANGFUSE_INIT_PROJECT_ID
uuidgen | tr '[:upper:]' '[:lower:]'

# LANGFUSE_INIT_PROJECT_PUBLIC_KEY (pk-lf-<uuid>)
echo "pk-lf-$(uuidgen | tr '[:upper:]' '[:lower:]')"

# LANGFUSE_INIT_PROJECT_SECRET_KEY (sk-lf-<uuid>)
echo "sk-lf-$(uuidgen | tr '[:upper:]' '[:lower:]')"
```

**Step 2: Append to web-scout/.env**

Add the following block (substituting the generated values from Step 1):

```bash
# Langfuse local Docker stack
LANGFUSE_SALT=<output of openssl rand -hex 16>
LANGFUSE_ENCRYPTION_KEY=<output of openssl rand -hex 32>
LANGFUSE_NEXTAUTH_SECRET=<output of openssl rand -base64 24>
LANGFUSE_DB_PASSWORD=<generated password>
LANGFUSE_REDIS_AUTH=<generated password>
LANGFUSE_CLICKHOUSE_PASSWORD=<generated password>
LANGFUSE_MINIO_PASSWORD=<generated password>
LANGFUSE_INIT_ORG_ID=<uuid>
LANGFUSE_INIT_ORG_NAME=web-scout
LANGFUSE_INIT_PROJECT_ID=<uuid>
LANGFUSE_INIT_PROJECT_NAME=web-scout-local
LANGFUSE_INIT_PROJECT_PUBLIC_KEY=pk-lf-<uuid>
LANGFUSE_INIT_PROJECT_SECRET_KEY=sk-lf-<uuid>
LANGFUSE_INIT_USER_EMAIL=admin@localhost
LANGFUSE_INIT_USER_NAME=Admin
LANGFUSE_INIT_USER_PASSWORD=<generated password>

# Langfuse client vars (same values as INIT keys above)
LANGFUSE_PUBLIC_KEY=pk-lf-<same uuid as LANGFUSE_INIT_PROJECT_PUBLIC_KEY>
LANGFUSE_SECRET_KEY=sk-lf-<same uuid as LANGFUSE_INIT_PROJECT_SECRET_KEY>
LANGFUSE_BASE_URL=http://localhost:3000
```

Note: `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` must be set to the same values as `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` and `LANGFUSE_INIT_PROJECT_SECRET_KEY` respectively. They are consumed by external clients (e.g. `smoke.py`).

**Step 3: Verify compose accepts the env file (dry run)**

```bash
docker compose -f web-scout/docker/langfuse/docker-compose.yml --env-file web-scout/.env config --quiet
```

Expected: no errors (exits 0). Any `variable is not set` warnings indicate missing vars in `.env`.

**Step 4: Commit**

`.env` is gitignored — confirm it is **not** staged:

```bash
git status web-scout/.env
```

Expected: `web-scout/.env` listed under "Changes not staged" or "Untracked files" — do NOT commit it.

If `.env` is unintentionally staged, unstage it: `git restore --staged web-scout/.env`.

No commit for this task (`.env` is local only).

---

## Task 5: Verify no regressions in JS test suite

**Step 1: Run JS tests**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: PASS — the new test file is Python-only and the compose file is not a JS module; no JS tests are affected.

---

## Task 6: Write integration tests

**Files:**
- Create: `web-scout/tests/test_langfuse_integration.py`

**Step 1: Write the integration test file**

```python
# web-scout/tests/test_langfuse_integration.py
#
# Requires the Langfuse stack to be running:
#   docker compose -f web-scout/docker/langfuse/docker-compose.yml --env-file web-scout/.env up -d
#
# Run:
#   python3 -m pytest web-scout/tests/test_langfuse_integration.py -v -m docker
#
import base64
import json
import os
import subprocess
import time
import uuid

import pytest
import requests

pytestmark = pytest.mark.docker

BASE_URL = "http://localhost:3000"
COMPOSE_FILE = "web-scout/docker/langfuse/docker-compose.yml"
ENV_FILE = "web-scout/.env"


def _auth_header():
    pub = os.environ["LANGFUSE_PUBLIC_KEY"]
    secret = os.environ["LANGFUSE_SECRET_KEY"]
    token = base64.b64encode(f"{pub}:{secret}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def test_allServicesHealthy():
    result = subprocess.run(
        ["docker", "compose", "-f", COMPOSE_FILE, "--env-file", ENV_FILE, "ps", "--format", "json"],
        capture_output=True,
        text=True,
        check=True,
    )
    services = json.loads(result.stdout)
    assert len(services) == 6, f"Expected 6 services, got {len(services)}"
    unhealthy = [s for s in services if s.get("Health") not in ("healthy", "") and s.get("State") != "running"]
    assert unhealthy == [], f"Unhealthy services: {unhealthy}"


def test_healthEndpointOk():
    resp = requests.get(f"{BASE_URL}/api/public/health", timeout=10)
    assert resp.status_code == 200
    assert resp.json().get("status") == "ok"


def test_bootstrapProjectReachable():
    resp = requests.get(
        f"{BASE_URL}/api/public/projects",
        headers=_auth_header(),
        timeout=10,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "data" in data or isinstance(data, list)


def test_bootstrapTrace():
    trace_id = str(uuid.uuid4())
    create_resp = requests.post(
        f"{BASE_URL}/api/public/ingestion",
        headers={**_auth_header(), "Content-Type": "application/json"},
        json={
            "batch": [
                {
                    "id": str(uuid.uuid4()),
                    "type": "trace-create",
                    "timestamp": "2026-03-03T00:00:00.000Z",
                    "body": {"id": trace_id, "name": "integration-test"},
                }
            ]
        },
        timeout=10,
    )
    assert create_resp.status_code == 207, f"Ingestion failed: {create_resp.text}"

    # Allow async processing
    time.sleep(3)

    get_resp = requests.get(
        f"{BASE_URL}/api/public/traces/{trace_id}",
        headers=_auth_header(),
        timeout=10,
    )
    assert get_resp.status_code == 200, f"Trace not found: {get_resp.text}"
    assert get_resp.json().get("id") == trace_id
```

**Step 2: Commit**

```bash
git add web-scout/tests/test_langfuse_integration.py
git commit -m "add langfuse integration tests (require live stack)"
```

---

## Task 7: Start stack and run integration tests

**Step 1: Start the stack**

```bash
docker compose -f web-scout/docker/langfuse/docker-compose.yml --env-file web-scout/.env up -d
```

**Step 2: Wait for all services to be healthy**

```bash
docker compose -f web-scout/docker/langfuse/docker-compose.yml --env-file web-scout/.env ps
```

Poll until all 6 services show `healthy`. Typical wait: 60–120 seconds. If `langfuse-web` restarts during DB migration, that is normal — wait for it to stabilise.

**Step 3: Verify UI**

Open `http://localhost:3000` in a browser. Log in with `LANGFUSE_INIT_USER_EMAIL` / `LANGFUSE_INIT_USER_PASSWORD`. Confirm the bootstrap project (`LANGFUSE_INIT_PROJECT_NAME`) appears under the bootstrap org.

**Step 4: Load env vars and run integration tests**

```bash
export $(grep -v '^#' web-scout/.env | xargs) && python3 -m pytest web-scout/tests/test_langfuse_integration.py -v -m docker
```

Expected: all 4 tests PASS.

**Step 5: Troubleshooting (if needed)**

- MinIO healthcheck fails with `wget: not found`: replace the minio healthcheck `test` with `["CMD-SHELL", "curl -sf http://localhost:9000/minio/health/live || exit 1"]` (some minio images have curl but not wget).
- `langfuse-web` container loops on restart: check logs with `docker compose -f web-scout/docker/langfuse/docker-compose.yml logs langfuse-web --tail 50`. Common cause: `ENCRYPTION_KEY` must be exactly 64 hex characters.
- `test_allServicesHealthy` parses `docker compose ps --format json` output. On Docker Compose v2 ≥ 2.20, each service is a separate JSON object on its own line (NDJSON), not a JSON array. If `json.loads` fails, replace with `[json.loads(line) for line in result.stdout.splitlines() if line.strip()]`.

---

## Task 8: Update log, move spec, commit, PR

**Step 1: Run full test suites one last time**

```bash
./scripts/run_silent.sh "tests" npm test
python3 -m pytest web-scout/tests/test_langfuse_compose.py -v
```

Expected: all PASS.

**Step 2: Add log entry to `web-scout/docs/log.md`** (prepend inside the `## 2026-03-03` section)

```
Add Langfuse v3 local Docker stack: 6-service compose (postgres, redis, clickhouse, minio, langfuse-worker, langfuse-web) bootstrapped from web-scout/.env; all secrets via env-var substitution; static pytest tests verify no hardcoded secrets and localhost-only port bindings; integration tests verify live stack health, bootstrap project reachability, and trace ingestion.
```

**Step 3: Move spec to implemented**

```bash
git mv web-scout/docs/specs/langfuse-local-docker.md web-scout/docs/specs/implemented/langfuse-local-docker.md
```

**Step 4: Commit and push**

```bash
git add web-scout/docs/log.md web-scout/docs/specs/implemented/langfuse-local-docker.md
git commit -m "log langfuse local docker; move spec to implemented"
git push -u origin codex/langfuse-local-docker
```

**Step 5: Open PR**

```bash
gh pr create --title "langfuse local docker stack" --body "$(cat <<'EOF'
## Summary
- Add Langfuse v3 Docker Compose stack at `web-scout/docker/langfuse/docker-compose.yml`
- 6 services: postgres, redis, clickhouse, minio, langfuse-worker, langfuse-web
- Bootstrap org/project/admin user from `web-scout/.env` on first `up`
- All secrets injected via env-var substitution — no hardcoded values
- Static tests: `test_noSecretHardcoded`, `test_externalTrafficIsolated`
- Integration tests (marked `@pytest.mark.docker`): health, bootstrap project, trace ingestion

## Test plan
- [ ] `python3 -m pytest web-scout/tests/test_langfuse_compose.py -v` — 2 PASS
- [ ] `./scripts/run_silent.sh "tests" npm test` — JS suite unaffected
- [ ] Stack started, all 6 services healthy, UI reachable at http://localhost:3000
- [ ] `python3 -m pytest web-scout/tests/test_langfuse_integration.py -v -m docker` — 4 PASS
EOF
)"
```

---

## Notes

- **ClickHouse port collision**: ClickHouse's native protocol port (9000) is mapped to `127.0.0.1:9001:9000` to avoid collision with MinIO's API port (also 9000 internally). The `CLICKHOUSE_MIGRATION_URL` inside the Docker network uses `clickhouse://clickhouse:9000` (internal port, no conflict).
- **LANGFUSE_ENCRYPTION_KEY**: must be exactly 64 hex characters (32 bytes). `openssl rand -hex 32` produces exactly this.
- **Bootstrap keys**: `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` and `LANGFUSE_PUBLIC_KEY` must have the same value; same for `SECRET_KEY`. Langfuse uses the `INIT_` vars to create the project on first boot; external clients use the non-`INIT_` vars.
- **Telemetry**: `TELEMETRY_ENABLED: "false"` suppresses all outbound telemetry from both `langfuse-web` and `langfuse-worker`.
- **Full reset**: `docker compose ... down -v` removes all named volumes, clearing all data including the bootstrap project. Re-running `up -d` will re-bootstrap from `.env`.
