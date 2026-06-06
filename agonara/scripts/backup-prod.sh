#!/usr/bin/env bash
set -euo pipefail

# Create a consistent production /data backup and copy it to off-host storage.
# AGONARA_BACKUP_REMOTE must be an rsync destination such as user@host:/path.

DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"
BACKUP_DIR="${AGONARA_BACKUP_DIR:-${DEPLOY_ROOT}/backups}"
BACKUP_REMOTE="${AGONARA_BACKUP_REMOTE:-}"
TIMESTAMP="${AGONARA_BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_FILE="agonara-data-${TIMESTAMP}.tar.gz"
COMPOSE=(docker compose --env-file .env.prod -f compose.prod.yml)

if [[ -z "${BACKUP_REMOTE}" ]]; then
  echo "AGONARA_BACKUP_REMOTE is required for off-host backup storage" >&2
  exit 1
fi

cd "${DEPLOY_ROOT}"
mkdir -p "${BACKUP_DIR}"

restart_prod() {
  "${COMPOSE[@]}" start agonara >/dev/null 2>&1 || true
}

trap restart_prod EXIT
"${COMPOSE[@]}" stop agonara
docker run --rm -v agonara-data:/data:ro -v "${BACKUP_DIR}:/backup" alpine:3.20 tar -czf "/backup/${BACKUP_FILE}" -C /data .
"${COMPOSE[@]}" start agonara
trap - EXIT
rsync -a "${BACKUP_DIR}/${BACKUP_FILE}" "${BACKUP_REMOTE}/"

echo "Production backup successful: ${BACKUP_FILE}"
