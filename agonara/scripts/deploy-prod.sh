#!/usr/bin/env bash
set -euo pipefail

# Deploy production by rebuilding the prod compose image.
# Snapshots the currently running prod image as agonara:rollback first
# so rollback-prod.sh can restore it on failure.
# Called by release-unit.yml via SSH on agonara-vps.

umask 022

DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"
UPLOAD_ROOT="${AGONARA_UPLOAD_ROOT:-/tmp/agonara-deploy}"
DEPLOY_VERSION="${AGONARA_DEPLOY_VERSION:-}"
DEPLOY_GIT_SHA="${AGONARA_GIT_SHA:-${GITHUB_SHA:-}}"
COMPOSE=(docker compose --env-file .env.prod -f compose.prod.yml)

read_package_version() {
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1" | head -n 1
}

require_upload_file() {
  if [[ ! -f "$1" ]]; then
    echo "Required Agonara deploy upload file is missing: $1" >&2
    exit 1
  fi
}

require_upload_directory() {
  if [[ ! -d "$1" ]]; then
    echo "Required Agonara deploy upload directory is missing: $1" >&2
    exit 1
  fi
}

require_upload_payload() {
  require_upload_file "${UPLOAD_ROOT}/Dockerfile"
  require_upload_file "${UPLOAD_ROOT}/package.json"
  require_upload_file "${UPLOAD_ROOT}/package-lock.json"
  require_upload_file "${UPLOAD_ROOT}/compose.prod.yml"
  require_upload_directory "${UPLOAD_ROOT}/src"
  require_upload_directory "${UPLOAD_ROOT}/scripts"
}

if [[ -z "${DEPLOY_GIT_SHA}" ]]; then
  echo "AGONARA_GIT_SHA or GITHUB_SHA is required" >&2
  exit 1
fi

require_upload_payload

cd "${DEPLOY_ROOT}"
rm -f .dockerignore
if [[ -f "${UPLOAD_ROOT}/.dockerignore" ]]; then
  cp "${UPLOAD_ROOT}/.dockerignore" .
fi
cp "${UPLOAD_ROOT}/Dockerfile" .
cp "${UPLOAD_ROOT}/package.json" .
cp "${UPLOAD_ROOT}/package-lock.json" .
cp "${UPLOAD_ROOT}/compose.prod.yml" .
rm -rf src
cp -r "${UPLOAD_ROOT}/src" .
rm -rf scripts
cp -r "${UPLOAD_ROOT}/scripts" .
chmod -R u=rwX,go=rX Dockerfile package.json package-lock.json compose.prod.yml src scripts
if [[ -f .dockerignore ]]; then
  chmod u=rw,go=r .dockerignore
fi

if [[ -z "${DEPLOY_VERSION}" ]]; then
  DEPLOY_VERSION="$(read_package_version package.json)"
fi
if [[ -z "${DEPLOY_VERSION}" ]]; then
  echo "Unable to determine Agonara package version" >&2
  exit 1
fi

docker tag agonara:latest agonara:rollback || true
"${COMPOSE[@]}" build
docker tag agonara:latest "agonara:${DEPLOY_VERSION}"
docker tag agonara:latest "agonara:${DEPLOY_GIT_SHA}"
"${COMPOSE[@]}" down
"${COMPOSE[@]}" up -d --no-build --wait
docker exec -e EXPECTED_VERSION="${DEPLOY_VERSION}" agonara node -e 'fetch("http://127.0.0.1:8080/operations/health").then(response => response.text()).then(body => { if (!body.includes(`"version":"${process.env.EXPECTED_VERSION}"`)) process.exit(1); }).catch(() => process.exit(1))'

echo "Production deploy successful"
