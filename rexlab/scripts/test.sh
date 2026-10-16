#!/bin/sh
# The rexlab check: clean install from the lockfile, typecheck, tests
# and build, the same steps as rexlab-core.yml.
set -eu

cd "$(dirname "$0")/.."

npm ci --no-audit --no-fund --loglevel=error
npm run typecheck --silent
npm test --silent
npm run build --silent >/dev/null
