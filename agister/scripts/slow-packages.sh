#!/bin/sh
# Reads go test's output and names each package whose tests took longer
# than the budget, in seconds, given as the argument: a package drifting
# toward the timeout is seen before it reaches it (LAB-222).
set -eu

awk -v budget="$1" '
  ($1 == "ok" || $1 == "FAIL") && $3 ~ /^[0-9.]+s$/ {
    seconds = $3
    sub(/s$/, "", seconds)
    if (seconds + 0 > budget + 0) {
      printf "slow: %s took %ss, over the %ss budget: make its tests cheaper\n", $2, seconds, budget
    }
  }
'
