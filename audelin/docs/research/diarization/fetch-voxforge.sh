#!/bin/sh
# VoxForge Russian (GPL), 16 kHz: every named speaker with 3 or more submissions,
# unpacked to work/Datasets/voxforge_ru/<user>/<submission>/. Skips what is there.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
url=http://www.repository.voxforge1.org/downloads/Russian/Trunk/Audio/Main/16kHz_16bit
out=$here/work/Datasets/voxforge_ru
mkdir -p "$out"
list=$(curl -fsSL "$url/" | grep -o 'href="[^"]*\.tgz"' | sed 's/href="//;s/"$//' | grep -vi anonymous)
users=$(echo "$list" | sed 's/-[0-9]\{8\}.*//' | sort | uniq -c | awk '$1 >= 3 {print $2}')
for u in $users; do
  for t in $(echo "$list" | grep "^$u-[0-9]\{8\}"); do
    d=$out/$u/${t%.tgz}
    [ -d "$d" ] && continue
    mkdir -p "$d.part"
    curl -fsSL "$url/$t" | tar xz -C "$d.part" --strip-components 1
    mv "$d.part" "$d"
  done
done
echo "voxforge: $(ls "$out" | wc -l | tr -d ' ') speakers"
