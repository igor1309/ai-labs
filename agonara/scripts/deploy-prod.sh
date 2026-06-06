#!/usr/bin/env bash
set -euo pipefail

# Deploy production by rebuilding the prod compose image.
# Snapshots the currently running prod image as agonara:rollback first
# so rollback-prod.sh can restore it on failure.
# Called by release-unit.yml via SSH on agonara-vps.

DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"
UPLOAD_ROOT="${AGONARA_UPLOAD_ROOT:-/tmp/agonara-deploy}"
DEPLOY_VERSION="${AGONARA_DEPLOY_VERSION:-}"
DEPLOY_GIT_SHA="${AGONARA_GIT_SHA:-${GITHUB_SHA:-}}"
COMPOSE=(docker compose --env-file .env.prod -f compose.prod.yml)

read_package_version() {
  node -e 'const fs = require("fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).version);' "$1"
}

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

if [[ -z "${DEPLOY_VERSION}" ]]; then
  DEPLOY_VERSION="$(read_package_version package.json)"
fi

docker tag agonara:latest agonara:rollback || true
"${COMPOSE[@]}" build
docker tag agonara:latest "agonara:${DEPLOY_VERSION}"
docker tag agonara:latest "agonara:${DEPLOY_GIT_SHA}"
"${COMPOSE[@]}" down
"${COMPOSE[@]}" up -d --no-build --wait
docker exec agonara wget -qO- http://127.0.0.1:8080/operations/health | grep -q "\"version\":\"${DEPLOY_VERSION}\""

echo "Production deploy successful"
