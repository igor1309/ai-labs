#!/usr/bin/env bash
set -e

# Deploy staging from files uploaded to /tmp/nomos-deploy.
# Called by release-unit.yml via SSH on the VPS.

cd /opt/nomos
cp /tmp/nomos-deploy/Dockerfile .
cp /tmp/nomos-deploy/package.json .
cp /tmp/nomos-deploy/package-lock.json .
cp /tmp/nomos-deploy/docker-compose.staging.yml .
rm -rf src && cp -r /tmp/nomos-deploy/src .
rm -rf scripts && cp -r /tmp/nomos-deploy/scripts .
docker build -t nomos:latest .
docker compose -f docker-compose.staging.yml down
docker compose -f docker-compose.staging.yml up -d --build
sleep 5
docker exec nomos-staging wget -qO- http://127.0.0.1:8081/health | grep -q '"ok"'
echo "Staging deploy successful"
