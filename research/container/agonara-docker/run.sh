#!/usr/bin/env bash
# Launch the agonara dev sandbox in one command. See playbook.md for the in-container flow.
# Usage:
#   ./run.sh            # build image if missing, then open an interactive shell
#   ./run.sh --build    # force a rebuild first
set -euo pipefail

IMAGE=agonara-dev:latest
VOLUME=agonara-home
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == "--build" ]] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker build -t "$IMAGE" "$DIR"
fi

docker volume create "$VOLUME" >/dev/null

# Named volume persists the clone + node_modules + gh/codex/claude auth across sessions.
# Resource limits cap a runaway agent. No host repo bind-mount, no docker socket: see playbook.
exec docker run -it --rm \
  --name agonara-dev \
  --memory 4g --cpus 2 --pids-limit 512 \
  -v "$VOLUME":/home/node \
  "$IMAGE"
