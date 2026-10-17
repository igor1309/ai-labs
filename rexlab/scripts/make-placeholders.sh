#!/bin/sh
# Makes the placeholder body picture of each dinosaur named, or of every
# dinosaur in the list when none is named, until its artwork exists.
# A placeholder is the dinosaur's name in capitals on a plain light shape
# with a dark outline: the shape is opaque, so the name reads the same on
# a light card and a dark one. It has the artwork's path, size and format
# (art/style.md), so a generated picture replaces it file for file.
#
# Needs ImageMagick (`magick`) and `cwebp`. FONT is a bold font file.
set -eu

cd "$(dirname "$0")/.."

FONT=${FONT:-/System/Library/Fonts/Supplemental/Arial Bold.ttf}
FILL='#fbf1c7'
INK='#2f4a1f'

if [ ! -f "$FONT" ]; then
  echo "make-placeholders: no font at $FONT; set FONT to a bold font file" >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# One "<id> <NAME>" line per dinosaur, the name in English capitals.
# shellcheck disable=SC2016 # the ${} are JavaScript's, not the shell's
node -e '
  const records = JSON.parse(require("node:fs").readFileSync("src/data/dinosaurs.json", "utf8"));
  const wanted = process.argv.slice(1);
  const unknown = wanted.filter((id) => !records.some((record) => record.id === id));
  if (unknown.length > 0) {
    console.error(`make-placeholders: no dinosaur ${unknown.join(", ")} in src/data/dinosaurs.json`);
    process.exit(1);
  }
  for (const { id, name } of records) {
    if (wanted.length === 0 || wanted.includes(id)) console.log(`${id} ${name.en.toUpperCase()}`);
  }
' "$@" >"$work/names"

while read -r id name; do
  mkdir -p "src/assets/dinos/$id"
  # The name is fitted to a box inside the shape, so the longest name
  # keeps its margin.
  magick -size 800x600 xc:none \
    -fill "$FILL" -stroke "$INK" -strokewidth 12 -draw "roundrectangle 16,16 783,583 72,72" \
    \( -size 680x200 -background none -fill "$INK" -stroke none -font "$FONT" -gravity center "label:$name" \) \
    -gravity center -composite \
    "$work/$id.png"
  cwebp -quiet -q 90 -alpha_q 100 -exact "$work/$id.png" -o "src/assets/dinos/$id/body.webp"
  echo "src/assets/dinos/$id/body.webp"
done <"$work/names"
