#!/usr/bin/env bash
set -euo pipefail

# Deploy staging from files uploaded to /tmp/agonara-deploy.
# Called by release-unit.yml via SSH on agonara-vps.

DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"
UPLOAD_ROOT="${AGONARA_UPLOAD_ROOT:-/tmp/agonara-deploy}"
DEPLOY_VERSION="${AGONARA_DEPLOY_VERSION:-$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")}"
DEPLOY_GIT_SHA="${AGONARA_GIT_SHA:-${GITHUB_SHA:-}}"
COMPOSE=(docker compose --env-file .env.staging -f compose.staging.yml)

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
cp "${UPLOAD_ROOT}/compose.staging.yml" .
rm -rf src
cp -r "${UPLOAD_ROOT}/src" .
rm -rf scripts
cp -r "${UPLOAD_ROOT}/scripts" .

"${COMPOSE[@]}" down
"${COMPOSE[@]}" build
docker tag agonara:staging "agonara:${DEPLOY_VERSION}"
docker tag agonara:staging "agonara:${DEPLOY_GIT_SHA}"
"${COMPOSE[@]}" up -d --no-build --wait
docker exec agonara-staging wget -qO- http://127.0.0.1:8080/operations/health | grep -q "\"version\":\"${DEPLOY_VERSION}\""

echo "Staging deploy successful"
