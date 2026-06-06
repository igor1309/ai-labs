#!/usr/bin/env bash
set -euo pipefail

# Restore the previous production image after a failed deploy.
# Called by release-unit.yml (if: failure()) via SSH on agonara-vps.

DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"
COMPOSE=(docker compose --env-file .env.prod -f compose.prod.yml)

cd "${DEPLOY_ROOT}"
if docker image inspect agonara:rollback >/dev/null 2>&1; then
  docker tag agonara:rollback agonara:latest
  "${COMPOSE[@]}" down
  "${COMPOSE[@]}" up -d --no-build --wait
  docker exec agonara node -e 'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))'
  echo "Rollback successful"
else
  echo "No rollback image available (first deploy?), skipping"
fi
