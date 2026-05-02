#!/usr/bin/env bash
set -e

# Restore the previous production image after a failed deploy.
# Called by release-unit.yml (if: failure()) via SSH on the VPS.

cd /opt/nomos
if docker image inspect nomos-nomos:rollback >/dev/null 2>&1; then
  docker tag nomos-nomos:rollback nomos-nomos:latest
  docker compose down
  docker compose up -d
  sleep 5
  docker exec nomos wget -qO- http://127.0.0.1:8080/health | grep -q '"ok"'
  echo "Rollback successful"
else
  echo "No rollback image available (first deploy?), skipping"
fi
