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
    services = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
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
