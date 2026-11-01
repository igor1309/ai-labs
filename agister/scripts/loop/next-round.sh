#!/usr/bin/env bash
# next-round.sh <dir> <prefix>: the next round number of files
# <prefix>-<n>-* in the branch's directory.
set -euo pipefail
dir=$1; shift
n=0
for f in "$dir/$1"-*; do
  [[ -e $f ]] || continue
  m=${f#"$dir/$1"-}; m=${m%%-*}; m=${m%%.*}
  [[ $m =~ ^[0-9]+$ ]] && (( m > n )) && n=$m
done
echo $((n + 1))
