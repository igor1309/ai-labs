#!/usr/bin/env bash
set -euo pipefail

# Restore staging /data from a backup tarball.
# Usage: agonara/scripts/restore-staging.sh /path/to/agonara-staging-data-YYYYMMDDTHHMMSSZ.tar.gz

DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"
DATA_VOLUME="${AGONARA_DATA_VOLUME:-agonara-staging_agonara-staging-data}"
BACKUP_FILE="${1:-}"
COMPOSE=(docker compose --env-file .env.staging -f compose.staging.yml)

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "backup file path is required" >&2
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

test -s "${BACKUP_FILE}"
BACKUP_BASENAME="$(basename "${BACKUP_FILE}")"
docker run --rm -v "$(dirname "${BACKUP_FILE}"):/restore:ro" alpine:3.20 sh -c 'tar -tzf "/restore/$1" | grep -Fx "./agonara.sqlite"' sh "${BACKUP_BASENAME}" >/dev/null

cd "${DEPLOY_ROOT}"
"${COMPOSE[@]}" down
docker run --rm -v "${DATA_VOLUME}:/data" -v "$(dirname "${BACKUP_FILE}"):/restore:ro" alpine:3.20 sh -c 'find /data -mindepth 1 -exec rm -rf {} + && tar -xzf "/restore/$1" -C /data' sh "${BACKUP_BASENAME}"
"${COMPOSE[@]}" up -d --no-build --wait
docker exec agonara-staging node -e 'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))'

echo "Staging restore successful"
