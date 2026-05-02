#!/usr/bin/env bash
set -e

# Deploy production by rebuilding the prod compose image.
# Snapshots the currently-running prod image as nomos-nomos:rollback first
# so rollback-prod.sh can restore it on failure.
# Called by release-unit.yml via SSH on the VPS.

cd /opt/nomos
docker tag nomos-nomos:latest nomos-nomos:rollback || true
docker compose down
docker compose up -d --build
sleep 5
docker exec nomos wget -qO- http://127.0.0.1:8080/health | grep -q '"ok"'
echo "Production deploy successful"
