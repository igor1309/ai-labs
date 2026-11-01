#!/bin/sh
# Makes the body picture of each flying or sea reptile named,
# src/assets/dinos/<id>/body.webp, by Codex image generation from its line
# in art/prompts.md and the flying or sea style prompt in art/style.md,
# with Archaeopteryx's picture as the style to match. Codex draws on flat
# magenta, which is cleared to alpha; the animal is then trimmed and set
# in the middle of the 800x600 frame with an even margin.
#
# The pictures are made side by side; each takes a few minutes. Codex's
# log and pictures stay in the work directory printed at the start.
#
# Needs `codex` signed in, ImageMagick (`magick`) and `cwebp`.
set -eu

cd "$(dirname "$0")/.."

if [ $# -eq 0 ]; then
  echo "usage: body-picture.sh <id>..." >&2
  exit 2
fi

# Codex writes only under /tmp.
work=$(mktemp -d /tmp/body-picture.XXXXXX)
echo "body-picture: working in $work"
magick src/assets/dinos/archaeopteryx/body.webp "$work/style.png"

# The style prompt of the group the prompt line names, between "> " lines
# under its heading.
style() {
  awk -v heading="## $1 style prompt" '$0 == heading { on = 1; next } on && /^## / { exit } on && /^> / { sub(/^> /, ""); printf "%s ", $0 }' art/style.md
}

make() {
  id=$1
  line=$(sed -n "s/^- \`$id\`: //p" art/prompts.md)
  if [ -z "$line" ]; then
    echo "body-picture: no prompt for $id in art/prompts.md" >&2
    return 1
  fi
  case $line in
    *pterosaur*) group=Flying ;;
    *) group=Sea ;;
  esac
  # -- ends --image's list: the prompt is not a picture.
  codex exec --skip-git-repo-check -C "$work" -s workspace-write -c approval_policy=never \
    -i "$work/style.png" -- \
    "Use your image generation tool to make a new picture. The attached picture is ONLY a style reference: match its picture-book style, line weight, shading and colour feel, but draw a different animal. $(style "$group") Draw: $line Landscape 4:3 canvas. Save the result as $work/$id.png and reply only with the saved path." \
    < /dev/null > "$work/$id.log" 2>&1
  if [ ! -f "$work/$id.png" ]; then
    echo "body-picture: Codex made no picture of $id; see $work/$id.log" >&2
    return 1
  fi
  # The magenta cleared, the outline's magenta fringe shaved off, and the
  # animal fitted inside a 20-pixel margin.
  magick "$work/$id.png" -alpha set -fuzz 22% -transparent '#FF00FF' \
    -channel A -morphology Erode Disk:1 +channel \
    -trim +repage -resize '760x560' -background none -gravity center -extent 800x600 "$work/$id-alpha.png"
  mkdir -p "src/assets/dinos/$id"
  cwebp -quiet -q 85 -alpha_q 90 "$work/$id-alpha.png" -o "src/assets/dinos/$id/body.webp"
  magick "$work/$id-alpha.png" -background '#fffdf8' -flatten "$work/$id-light.png"
  echo "body-picture: src/assets/dinos/$id/body.webp; check $work/$id-light.png"
}

pids=
for id in "$@"; do
  make "$id" &
  pids="$pids $!"
done
failed=0
for pid in $pids; do
  wait "$pid" || failed=1
done
exit $failed
