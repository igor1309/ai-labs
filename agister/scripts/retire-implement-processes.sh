#!/bin/sh
# Retires home's processes implement_codex, implement_pi and
# implement_pi_glm, so home's settings folder installs over a home that
# holds them. The folder has workflows of those names, each a call of
# implement on an agent (ADR-030 rule 6); a process and a workflow of one
# name fail check, so the install is refused while home holds them. An
# install never deletes a document (ADR-016 rule 8): this is the explicit
# step that does, run once, before that install.
#
# Each of the three home holds is backed up first, as an install backup of
# its own: its bytes, then the manifest, which records it as replaced by
# nothing. `agister install --restore <stamp>` puts them back. Only then
# are they removed. A home that holds none of them is left as it is, and
# nothing else of home is touched. It takes no lock: run it while no
# agister install or restore runs.
#
# Usage: retire-implement-processes.sh [home]
# home is $AGISTER_HOME when not given, else ~/.agister, as for agister.
set -eu

home=$(cd "${1:-${AGISTER_HOME:-$HOME/.agister}}" && pwd)
case $home in
  *'"'* | *\\*)
    echo "retire: $home cannot be named in a backup's manifest" >&2
    exit 1
    ;;
esac

names="implement_codex implement_pi implement_pi_glm"
held=""
for name in $names; do
  if [ -e "$home/processes/$name.yaml" ]; then
    held="$held $name"
  fi
done
if [ -z "$held" ]; then
  echo "retire: $home holds none of $names: nothing to retire"
  exit 0
fi

digest() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  else
    shasum -a 256 "$1"
  fi | cut -d ' ' -f 1
}

# The stamp sorts with install's by time, as install names its own:
# to the microsecond, then a random suffix.
installed=$(date -u +%Y-%m-%dT%H:%M:%SZ)
compact=$(printf '%s' "$installed" | tr -d ':-')
stamp="${compact%Z}.000000Z-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')"
backup="$home/backups/$stamp"

mkdir -p "$home/backups"
mkdir "$backup"
trap 'rm -rf "$backup"' EXIT
mkdir "$backup/processes"
documents=""
for name in $held; do
  cp "$home/processes/$name.yaml" "$backup/processes/$name.yaml"
  documents="$documents${documents:+,}
    {
      \"path\": \"$home/processes/$name.yaml\",
      \"kind\": \"processes\",
      \"name\": \"$name\",
      \"action\": \"replace\",
      \"before\": \"$(digest "$backup/processes/$name.yaml")\",
      \"after\": \"\"
    }"
done
cat >"$backup/manifest.json.tmp" <<EOF
{
  "stamp": "$stamp",
  "source": "retire-implement-processes.sh",
  "installed": "$installed",
  "documents": [$documents
  ]
}
EOF
mv "$backup/manifest.json.tmp" "$backup/manifest.json"
sync
trap - EXIT

for name in $held; do
  rm "$home/processes/$name.yaml"
  echo "retired process $name"
done
echo "backed up as $stamp; restore with: agister install --restore $stamp"
