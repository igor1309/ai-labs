#!/usr/bin/env bash
set -euo pipefail

# Restore the previous production image after a failed deploy.
# Called by release-unit.yml (if: failure()) via SSH on agonara-vps.

DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"
DEPLOY_VERSION="${AGONARA_DEPLOY_VERSION:-}"
COMPOSE=(docker compose --env-file .env.prod -f compose.prod.yml)

read_package_version() {
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1" | head -n 1
}

cd "${DEPLOY_ROOT}"
if [[ -z "${DEPLOY_VERSION}" ]]; then
  DEPLOY_VERSION="$(read_package_version package.json)"
fi

if docker image inspect agonara:rollback >/dev/null 2>&1; then
  docker tag agonara:rollback agonara:latest
  "${COMPOSE[@]}" down
  "${COMPOSE[@]}" up -d --no-build --wait
  docker exec -e EXPECTED_VERSION="${DEPLOY_VERSION}" agonara node -e 'fetch("http://127.0.0.1:8080/operations/health").then(response => response.text()).then(body => { if (!body.includes(`"version":"${process.env.EXPECTED_VERSION}"`)) process.exit(1); }).catch(() => process.exit(1))'
  echo "Rollback successful"
else
  echo "No rollback image available (first deploy?), skipping"
fi
