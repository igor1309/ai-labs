#!/usr/bin/env bash
set -euo pipefail

# Restore production /data from a backup tarball.
# Usage: agonara/scripts/restore-prod.sh /path/to/agonara-data-YYYYMMDDTHHMMSSZ.tar.gz

DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"
BACKUP_FILE="${1:-}"
COMPOSE=(docker compose --env-file .env.prod -f compose.prod.yml)

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "backup file path is required" >&2
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

cd "${DEPLOY_ROOT}"
BACKUP_BASENAME="$(basename "${BACKUP_FILE}")"
"${COMPOSE[@]}" down
docker run --rm -v agonara-data:/data -v "$(dirname "${BACKUP_FILE}"):/restore:ro" alpine:3.20 sh -c 'find /data -mindepth 1 -exec rm -rf {} + && tar -xzf "/restore/$1" -C /data' sh "${BACKUP_BASENAME}"
"${COMPOSE[@]}" up -d --no-build --wait
docker exec agonara node -e 'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))'

echo "Production restore successful"
