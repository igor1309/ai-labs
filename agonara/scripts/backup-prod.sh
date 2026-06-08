#!/usr/bin/env bash
set -euo pipefail

# Create a consistent production /data backup and copy it to off-host storage.
# AGONARA_BACKUP_REMOTE must be an rsync destination such as user@host:/path.

DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"
BACKUP_DIR="${AGONARA_BACKUP_DIR:-${DEPLOY_ROOT}/backups}"
BACKUP_REMOTE="${AGONARA_BACKUP_REMOTE:-}"
BACKUP_SSH_KEY="${AGONARA_BACKUP_SSH_KEY:-}"
BACKUP_RETENTION_DAYS="${AGONARA_BACKUP_RETENTION_DAYS:-14}"
DATA_VOLUME="${AGONARA_DATA_VOLUME:-agonara-prod_agonara-data}"
TIMESTAMP="${AGONARA_BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_FILE="agonara-data-${TIMESTAMP}.tar.gz"
COMPOSE=(docker compose --env-file .env.prod -f compose.prod.yml)

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

restart_prod() {
  "${COMPOSE[@]}" start agonara >/dev/null 2>&1 || true
}

trap restart_prod EXIT
"${COMPOSE[@]}" stop agonara
docker run --rm -v "${DATA_VOLUME}:/data:ro" -v "${BACKUP_DIR}:/backup" alpine:3.20 tar -czf "/backup/${BACKUP_FILE}" -C /data .
test -s "${BACKUP_DIR}/${BACKUP_FILE}"
docker run --rm -v "${BACKUP_DIR}:/backup:ro" alpine:3.20 sh -c 'tar -tzf "/backup/$1" | grep -Fx "./agonara.sqlite"' sh "${BACKUP_FILE}" >/dev/null
"${COMPOSE[@]}" start agonara
trap - EXIT
"${RSYNC[@]}" "${BACKUP_DIR}/${BACKUP_FILE}" "${BACKUP_REMOTE}/"
find "${BACKUP_DIR}" -type f -name "agonara-data-*.tar.gz" -mtime "+${BACKUP_RETENTION_DAYS}" -delete

echo "Production backup successful: ${BACKUP_FILE}"
