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
