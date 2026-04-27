#!/usr/bin/env bash
set -e

# Deploy production using the image built during staging.
# Tags the current image as nomos:rollback before replacing it.
# Called by release-unit.yml via SSH on the VPS.

cd /opt/nomos
docker tag nomos:latest nomos:rollback || true
docker compose down
docker compose up -d
sleep 5
docker exec nomos wget -qO- http://127.0.0.1:8080/health | grep -q '"ok"'
echo "Production deploy successful"
