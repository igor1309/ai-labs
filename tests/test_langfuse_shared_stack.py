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
            is_url = value.startswith("http://") or value.startswith("https://")
            is_local_dev_key = value in ("pk-lf-local", "sk-lf-local", "minio")
            if not is_placeholder and not is_local_dev_key and not is_url:
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
