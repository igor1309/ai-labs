#!/bin/sh
# The Agister check. Agister builds against ../gokit, so it runs gokit's
# check; Agister's own format, vet and race tests join it with its first
# code.
set -eu

cd "$(dirname "$0")/.."

../gokit/scripts/test.sh
