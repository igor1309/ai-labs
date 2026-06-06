#!/usr/bin/env bash
set -euo pipefail

# Create a consistent staging /data backup and copy it to off-host storage.
# AGONARA_BACKUP_REMOTE must be an rsync destination such as user@host:/path.

DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"
BACKUP_DIR="${AGONARA_BACKUP_DIR:-${DEPLOY_ROOT}/backups/staging}"
BACKUP_REMOTE="${AGONARA_BACKUP_REMOTE:-}"
BACKUP_SSH_KEY="${AGONARA_BACKUP_SSH_KEY:-}"
BACKUP_RETENTION_DAYS="${AGONARA_BACKUP_RETENTION_DAYS:-14}"
DATA_VOLUME="${AGONARA_DATA_VOLUME:-agonara-staging_agonara-staging-data}"
TIMESTAMP="${AGONARA_BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_FILE="agonara-staging-data-${TIMESTAMP}.tar.gz"
COMPOSE=(docker compose --env-file .env.staging -f compose.staging.yml)

if [[ -z "${BACKUP_REMOTE}" ]]; then
  echo "AGONARA_BACKUP_REMOTE is required for off-host backup storage" >&2
  exit 1
fi

cd "${DEPLOY_ROOT}"
mkdir -p "${BACKUP_DIR}"
RSYNC=(rsync -a)
if [[ -n "${BACKUP_SSH_KEY}" ]]; then
  RSYNC+=( -e "ssh -i ${BACKUP_SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" )
fi

restart_staging() {
  "${COMPOSE[@]}" start agonara >/dev/null 2>&1 || true
}

trap restart_staging EXIT
"${COMPOSE[@]}" stop agonara
docker run --rm -v "${DATA_VOLUME}:/data:ro" -v "${BACKUP_DIR}:/backup" alpine:3.20 tar -czf "/backup/${BACKUP_FILE}" -C /data .
test -s "${BACKUP_DIR}/${BACKUP_FILE}"
"${COMPOSE[@]}" start agonara
trap - EXIT
"${RSYNC[@]}" "${BACKUP_DIR}/${BACKUP_FILE}" "${BACKUP_REMOTE}/"
find "${BACKUP_DIR}" -type f -name "agonara-staging-data-*.tar.gz" -mtime "+${BACKUP_RETENTION_DAYS}" -delete

echo "Staging backup successful: ${BACKUP_FILE}"
