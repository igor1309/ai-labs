---
date: 2026-03-03
model: claude-opus-4-6
description: "Implementation plan: promote Langfuse stack to shared repo-level infrastructure"
---

# Shared Langfuse Stack — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the Langfuse Docker stack from `web-scout/docker/langfuse/` to `docker/langfuse/` so any ai-labs project can share a single local Langfuse instance.

**Architecture:** Copy the 6-service compose stack (postgres, redis, clickhouse, minio, langfuse-worker, langfuse-web) plus ClickHouse config to `docker/langfuse/`. Create a standalone `.env.example`. Update web-scout references. Remove the old location.

**Tech Stack:** Docker Compose, Python (pytest), YAML

**Spec:** `docs/specs/langfuse-shared-stack.md`

**Worktree required:** yes
**Expected worktree:** `worktrees/langfuse-shared`
**Expected branch:** `codex/langfuse-shared`
**Preflight check:** [ ] done

---

## Task 1: Create `docker/langfuse/` with compose file and ClickHouse config

**Files:**
- Create: `docker/langfuse/docker-compose.yml`
- Create: `docker/langfuse/clickhouse-config/cluster.xml`
- Create: `docker/langfuse/clickhouse-config/keeper.xml`
- Create: `docker/langfuse/clickhouse-config/listen.xml`
- Create: `docker/langfuse/clickhouse-config/macros.xml`

**Step 1: Copy compose file with updated paths**

Copy `web-scout/docker/langfuse/docker-compose.yml` to `docker/langfuse/docker-compose.yml`. Update only the usage comment at the top:

```yaml
# docker/langfuse/docker-compose.yml
# Usage:
#   docker compose -f docker/langfuse/docker-compose.yml --env-file docker/langfuse/.env up -d
#   docker compose -f docker/langfuse/docker-compose.yml down
#   docker compose -f docker/langfuse/docker-compose.yml down -v   # full reset
```

Everything else stays identical — the `./clickhouse-config` bind-mount resolves relative to the compose file, so it still works.

**Step 2: Copy ClickHouse config files**

Copy all four files from `web-scout/docker/langfuse/clickhouse-config/` to `docker/langfuse/clickhouse-config/` unchanged:
- `cluster.xml`
- `keeper.xml`
- `listen.xml`
- `macros.xml`

**Step 3: Verify compose is valid YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('docker/langfuse/docker-compose.yml'))"`
Expected: no error

**Step 4: Commit**

```bash
git add docker/langfuse/docker-compose.yml docker/langfuse/clickhouse-config/
git commit -m "add shared langfuse stack at docker/langfuse/"
```

---

## Task 2: Create `.env.example` (committed) and gitignore `.env`

**Files:**
- Create: `docker/langfuse/.env.example`
- Modify: `.gitignore`

**Step 1: Create `.env.example` with placeholder values**

Document every required variable with a safe placeholder. Group into infrastructure secrets vs bootstrap config. All values must be obviously fake placeholders (no real secrets).

```ini
# docker/langfuse/.env.example
# Infrastructure secrets — generate real values for docker/langfuse/.env
LANGFUSE_DB_PASSWORD=change-me-db-password
LANGFUSE_REDIS_AUTH=change-me-redis-auth
LANGFUSE_CLICKHOUSE_PASSWORD=change-me-clickhouse-password
LANGFUSE_MINIO_USER=minio
LANGFUSE_MINIO_PASSWORD=change-me-minio-password
LANGFUSE_SALT=change-me-salt
LANGFUSE_ENCRYPTION_KEY=change-me-encryption-key-must-be-256bit-hex
LANGFUSE_NEXTAUTH_SECRET=change-me-nextauth-secret
LANGFUSE_NEXTAUTH_URL=http://localhost:3000

# Bootstrap (optional) — auto-create org/project/user on first boot
LANGFUSE_INIT_ORG_ID=org-local
LANGFUSE_INIT_ORG_NAME=ai-labs
LANGFUSE_INIT_PROJECT_ID=project-local
LANGFUSE_INIT_PROJECT_NAME=default
LANGFUSE_INIT_PROJECT_PUBLIC_KEY=pk-lf-local
LANGFUSE_INIT_PROJECT_SECRET_KEY=sk-lf-local
LANGFUSE_INIT_USER_EMAIL=admin@localhost
LANGFUSE_INIT_USER_NAME=admin
LANGFUSE_INIT_USER_PASSWORD=change-me-admin-password
```

**Step 2: Add gitignore rule for `docker/langfuse/.env`**

The root `.gitignore` already has `.env` and `!.env.example` patterns which apply recursively. Verify that `docker/langfuse/.env` is ignored and `docker/langfuse/.env.example` is not:

Run: `git check-ignore docker/langfuse/.env && echo "IGNORED" || echo "NOT IGNORED"`
Expected: `IGNORED`

Run: `git check-ignore docker/langfuse/.env.example && echo "IGNORED" || echo "NOT IGNORED"`
Expected: `NOT IGNORED`

If the existing `.gitignore` patterns already cover this (they should — `.env` is listed at root level and `!.env.example` negates it), no `.gitignore` edit is needed. If not, add a specific entry.

**Step 3: Commit**

```bash
git add docker/langfuse/.env.example
git commit -m "add langfuse .env.example with placeholder values"
```

---

## Task 3: Write static tests for the shared stack

**Files:**
- Create: `tests/test_langfuse_shared_stack.py`

The spec defines 5 static tests. Write them as a single pytest file at repo level (not under `web-scout/tests/`).

**Step 1: Write the test file**

```python
# tests/test_langfuse_shared_stack.py
import re
from pathlib import Path

import yaml

STACK_DIR = Path(__file__).parent.parent / "docker" / "langfuse"
COMPOSE_PATH = STACK_DIR / "docker-compose.yml"
ENV_EXAMPLE_PATH = STACK_DIR / ".env.example"
WEB_SCOUT_ENV = Path(__file__).parent.parent / "web-scout" / ".env"

ENV_VAR_RE = re.compile(r"^\$\{[A-Z_][A-Z0-9_]*\}$")
SECRET_KEYWORDS = {"password", "secret", "key", "salt", "auth", "encryption"}
PLACEHOLDER_KEYWORDS = {"change-me", "change_me", "placeholder", "replace"}
STACK_INFRA_VARS = {
    "LANGFUSE_DB_PASSWORD",
    "LANGFUSE_REDIS_AUTH",
    "LANGFUSE_CLICKHOUSE_PASSWORD",
    "LANGFUSE_MINIO_PASSWORD",
    "LANGFUSE_SALT",
    "LANGFUSE_ENCRYPTION_KEY",
    "LANGFUSE_NEXTAUTH_SECRET",
}


def _load_compose():
    with open(COMPOSE_PATH) as f:
        return yaml.safe_load(f)


def _parse_env_file(path):
    """Return dict of VAR=VALUE from a .env file, skipping comments/blanks."""
    result = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                result[key.strip()] = value.strip()
    return result


def test_envExampleExists():
    assert ENV_EXAMPLE_PATH.exists(), f"{ENV_EXAMPLE_PATH} must exist"


def test_envExampleContainsNoRealSecrets():
    env = _parse_env_file(ENV_EXAMPLE_PATH)
    real_secrets = []
    for key, value in env.items():
        if any(k in key.lower() for k in SECRET_KEYWORDS):
            is_placeholder = any(p in value.lower() for p in PLACEHOLDER_KEYWORDS)
            is_safe_default = value in ("minio",)
            if not is_placeholder and not is_safe_default:
                real_secrets.append(f"{key}={value}")
    assert real_secrets == [], (
        "Possible real secrets in .env.example:\n" + "\n".join(real_secrets)
    )


def test_composeExistsAndIsValidYaml():
    assert COMPOSE_PATH.exists(), f"{COMPOSE_PATH} must exist"
    _load_compose()  # raises on invalid YAML


def test_composeBindsOnlyToLocalhost():
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
    assert violations == [], (
        "Non-public services with unrestricted port binding:\n"
        + "\n".join(violations)
    )


def test_webScoutEnvHasNoStackInfraSecrets():
    if not WEB_SCOUT_ENV.exists():
        return  # CI may not have a .env; pass vacuously
    env = _parse_env_file(WEB_SCOUT_ENV)
    leaked = [k for k in STACK_INFRA_VARS if k in env]
    assert leaked == [], (
        "web-scout/.env still contains stack infrastructure secrets:\n"
        + "\n".join(leaked)
    )
```

**Step 2: Run the tests (only the first 4 pass at this point; test 5 will fail until Task 5)**

Run: `./scripts/run_silent.sh "shared-stack-tests" python3 -m pytest tests/test_langfuse_shared_stack.py -v -k "not webScoutEnv"`
Expected: 4 tests PASS

**Step 3: Commit**

```bash
git add tests/test_langfuse_shared_stack.py
git commit -m "add static tests for shared langfuse stack"
```

---

## Task 4: Update `web-scout/docs/langfuse.md` to reference shared stack

**Files:**
- Modify: `web-scout/docs/langfuse.md`

**Step 1: Update the doc**

Replace the start/stop commands and any `web-scout/docker/langfuse/` path references to point at `docker/langfuse/`. Keep the rest of the document intact.

Updated "Start the stack" section:

```bash
docker compose -f docker/langfuse/docker-compose.yml --env-file docker/langfuse/.env up -d
```

Updated "Stop the stack" section:

```bash
docker compose -f docker/langfuse/docker-compose.yml down
```

Remove the reference to `web-scout/.env` for sign-in credentials — change to `docker/langfuse/.env`.

**Step 2: Commit**

```bash
git add web-scout/docs/langfuse.md
git commit -m "update langfuse doc to reference shared stack path"
```

---

## Task 5: Migrate `web-scout/.env` — remove stack infrastructure secrets

**Files:**
- Modify: `web-scout/.env` (gitignored, local-only)

**Step 1: Create `docker/langfuse/.env` from the existing secrets**

Copy the infrastructure secrets from `web-scout/.env` to a new `docker/langfuse/.env`. This includes:
- `LANGFUSE_DB_PASSWORD`, `LANGFUSE_REDIS_AUTH`, `LANGFUSE_CLICKHOUSE_PASSWORD`
- `LANGFUSE_MINIO_USER`, `LANGFUSE_MINIO_PASSWORD`
- `LANGFUSE_SALT`, `LANGFUSE_ENCRYPTION_KEY`
- `LANGFUSE_NEXTAUTH_SECRET`, `LANGFUSE_NEXTAUTH_URL`
- All `LANGFUSE_INIT_*` bootstrap vars

**Step 2: Remove infrastructure secrets from `web-scout/.env`**

Remove all vars listed above from `web-scout/.env`. Keep only the three client vars:
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_BASE_URL`

**Step 3: Run the "no stack secrets in web-scout" test**

Run: `./scripts/run_silent.sh "shared-stack-tests" python3 -m pytest tests/test_langfuse_shared_stack.py::test_webScoutEnvHasNoStackInfraSecrets -v`
Expected: PASS

**Step 4: Run all static tests**

Run: `./scripts/run_silent.sh "shared-stack-tests" python3 -m pytest tests/test_langfuse_shared_stack.py -v`
Expected: 5 tests PASS

**Step 5: No commit** (`.env` files are gitignored — this is a local-only change)

---

## Task 6: Update integration tests to reference shared stack paths

**Files:**
- Modify: `web-scout/tests/test_langfuse_integration.py:23-24`
- Modify: `web-scout/tests/test_langfuse_compose.py:6`

**Step 1: Update `test_langfuse_integration.py`**

Change the constants at the top:

```python
COMPOSE_FILE = "docker/langfuse/docker-compose.yml"
ENV_FILE = "docker/langfuse/.env"
```

**Step 2: Update `test_langfuse_compose.py`**

Change `COMPOSE_PATH` to reference the shared stack:

```python
COMPOSE_PATH = Path(__file__).parent.parent.parent / "docker" / "langfuse" / "docker-compose.yml"
```

**Step 3: Run compose structure tests**

Run: `./scripts/run_silent.sh "compose-tests" python3 -m pytest web-scout/tests/test_langfuse_compose.py -v`
Expected: 2 tests PASS

**Step 4: Commit**

```bash
git add web-scout/tests/test_langfuse_integration.py web-scout/tests/test_langfuse_compose.py
git commit -m "update langfuse test paths to shared stack location"
```

---

## Task 7: Remove `web-scout/docker/langfuse/`

**Files:**
- Delete: `web-scout/docker/langfuse/docker-compose.yml`
- Delete: `web-scout/docker/langfuse/clickhouse-config/cluster.xml`
- Delete: `web-scout/docker/langfuse/clickhouse-config/keeper.xml`
- Delete: `web-scout/docker/langfuse/clickhouse-config/listen.xml`
- Delete: `web-scout/docker/langfuse/clickhouse-config/macros.xml`

**Step 1: Verify no other files reference the old path**

Run: `grep -r "web-scout/docker/langfuse" --include="*.py" --include="*.md" --include="*.yml" --include="*.yaml" --include="*.sh" .`
Expected: no matches (all references were updated in Tasks 4 and 6)

If matches remain, update them before proceeding.

**Step 2: Remove the old directory**

```bash
git rm -r web-scout/docker/langfuse/
```

**Step 3: Run all static tests to confirm nothing broke**

Run: `./scripts/run_silent.sh "shared-stack-tests" python3 -m pytest tests/test_langfuse_shared_stack.py -v`
Expected: 5 tests PASS (or 4 + skip if no web-scout/.env in worktree)

Run: `./scripts/run_silent.sh "compose-tests" python3 -m pytest web-scout/tests/test_langfuse_compose.py -v`
Expected: 2 tests PASS

**Step 4: Commit**

```bash
git commit -m "remove old web-scout/docker/langfuse/ directory"
```

---

## Task 8: Run full test suite and move spec to implemented

**Files:**
- Move: `docs/specs/langfuse-shared-stack.md` → `docs/specs/implemented/langfuse-shared-stack.md`
- Modify: `docs/log.md`

**Step 1: Run the full test suite**

Run: `./scripts/run_silent.sh "tests" npm test`
Expected: all tests PASS

Run: `./scripts/run_silent.sh "build" npx tsc --noEmit`
Expected: PASS

**Step 2: Move the spec**

```bash
mkdir -p docs/specs/implemented
git mv docs/specs/langfuse-shared-stack.md docs/specs/implemented/langfuse-shared-stack.md
```

**Step 3: Update log**

Add entry to `docs/log.md` under today's date:

```markdown
- promote langfuse stack from `web-scout/docker/langfuse/` to shared `docker/langfuse/`; all projects can now share a single local instance
```

**Step 4: Commit**

```bash
git add docs/specs/implemented/langfuse-shared-stack.md docs/log.md
git commit -m "close langfuse-shared-stack spec: move to implemented, update log"
```

---

## Task 9 (manual): Integration verification

This task requires a running Docker stack and is not automatable in CI.

**Step 1: Start the shared stack**

```bash
docker compose -f docker/langfuse/docker-compose.yml --env-file docker/langfuse/.env up -d
```

**Step 2: Wait for all services to be healthy**

```bash
docker compose -f docker/langfuse/docker-compose.yml ps
```
Expected: 6 services, all healthy/running

**Step 3: Run integration tests**

```bash
python3 -m pytest web-scout/tests/test_langfuse_integration.py -v -m docker
```
Expected: 4 tests PASS

**Step 4: Run a smoke test with Langfuse tracing**

```bash
cd web-scout && python3 smoke.py
```
Verify trace appears in Langfuse UI at `http://localhost:3000`.

**Step 5: Stop the stack**

```bash
docker compose -f docker/langfuse/docker-compose.yml down
```
