#!/usr/bin/env bash
# Run browser contracts in CI's Linux Playwright container, where text renders
# wider than on a Mac. Usage: scripts/linux-browser.sh tests/a.browser.cjs [...]
set -euo pipefail
[ $# -gt 0 ] || { echo "usage: $0 tests/x.browser.cjs ..." >&2; exit 2; }
image=mcr.microsoft.com/playwright:v1.64.1-noble
docker run --rm -v "$PWD":/src:ro "$image" bash -c '
  set -euo pipefail
  mkdir /w && cd /src && tar --exclude=node_modules --exclude=dist -cf - . | tar -xf - -C /w
  cd /w
  npm ci --no-audit --no-fund >/tmp/ci.log 2>&1 || { tail -40 /tmp/ci.log; exit 1; }
  for t in "$@"; do echo "== $t"; node "$t"; done
' bash "$@"
