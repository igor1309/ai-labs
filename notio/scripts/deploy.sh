#!/usr/bin/env bash
set -euo pipefail

if [ -z "${NOTIO_VERSION:-}" ]; then
  echo "NOTIO_VERSION is required"
  exit 1
fi

if [ -z "${NOTIO_GIT_SHA:-}" ]; then
  echo "NOTIO_GIT_SHA is required"
  exit 1
fi

deploy_tmp_dir="/tmp/notio-deploy"
deploy_dir="/opt/notio"

mkdir -p "$deploy_dir"

if [ ! -f "$deploy_dir/.env" ]; then
  echo "Missing required runtime env file: $deploy_dir/.env"
  exit 1
fi

cp "$deploy_tmp_dir/Dockerfile" "$deploy_dir/Dockerfile"
cp "$deploy_tmp_dir/Package.swift" "$deploy_dir/Package.swift"
cp "$deploy_tmp_dir/Package.resolved" "$deploy_dir/Package.resolved"
cp "$deploy_tmp_dir/docker-compose.yml" "$deploy_dir/docker-compose.yml"
rm -rf "$deploy_dir/Sources" "$deploy_dir/scripts"
cp -r "$deploy_tmp_dir/Sources" "$deploy_dir/Sources"
cp -r "$deploy_tmp_dir/scripts" "$deploy_dir/scripts"

cd "$deploy_dir"

running_image_id="$(docker inspect --format '{{.Image}}' notio 2>/dev/null || true)"
if [ -n "$running_image_id" ]; then
  docker tag "$running_image_id" notio:rollback
fi

docker build --build-arg VERSION="$NOTIO_VERSION" -t "notio:$NOTIO_VERSION" -t "notio:$NOTIO_GIT_SHA" .

export NOTIO_VERSION
docker compose down
docker compose up -d

health_url="http://127.0.0.1:8080/health"
max_attempts=30
attempt=1
while [ "$attempt" -le "$max_attempts" ]; do
  if curl -fsS "$health_url" >/dev/null; then
    echo "Deploy successful: health endpoint is reachable"
    exit 0
  fi
  sleep 2
  attempt=$((attempt + 1))
done

echo "Deploy failed: health endpoint did not become reachable in time"
exit 1
