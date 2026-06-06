#!/usr/bin/env bash
set -euo pipefail

# Deploy production by rebuilding the prod compose image.
# Snapshots the currently running prod image as agonara:rollback first
# so rollback-prod.sh can restore it on failure.
# Called by release-unit.yml via SSH on agonara-vps.

DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"
UPLOAD_ROOT="${AGONARA_UPLOAD_ROOT:-/tmp/agonara-deploy}"
DEPLOY_VERSION="${AGONARA_DEPLOY_VERSION:-$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")}"
DEPLOY_GIT_SHA="${AGONARA_GIT_SHA:-${GITHUB_SHA:-}}"
COMPOSE=(docker compose --env-file .env.prod -f compose.prod.yml)

if [[ -z "${DEPLOY_GIT_SHA}" ]]; then
  echo "AGONARA_GIT_SHA or GITHUB_SHA is required" >&2
  exit 1
fi

cd "${DEPLOY_ROOT}"
cp "${UPLOAD_ROOT}/Dockerfile" .
cp "${UPLOAD_ROOT}/package.json" .
if [[ -f "${UPLOAD_ROOT}/package-lock.json" ]]; then
  cp "${UPLOAD_ROOT}/package-lock.json" .
fi
cp "${UPLOAD_ROOT}/compose.prod.yml" .
rm -rf src
cp -r "${UPLOAD_ROOT}/src" .
rm -rf scripts
cp -r "${UPLOAD_ROOT}/scripts" .

docker tag agonara:latest agonara:rollback || true
"${COMPOSE[@]}" down
"${COMPOSE[@]}" build
docker tag agonara:latest "agonara:${DEPLOY_VERSION}"
docker tag agonara:latest "agonara:${DEPLOY_GIT_SHA}"
"${COMPOSE[@]}" up -d --no-build --wait
docker exec agonara wget -qO- http://127.0.0.1:8080/operations/health | grep -q "\"version\":\"${DEPLOY_VERSION}\""

echo "Production deploy successful"
