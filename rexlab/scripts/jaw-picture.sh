#!/bin/sh
# Makes the Whose Jaw? pictures of each dinosaur named: its loose jaw,
# src/assets/jaws/<id>.webp, from its line under "Jaws" in art/prompts.md
# and the jaw style prompt, and its gummy mouth,
# src/assets/dinos/<id>/gummy.webp, edited from its body picture with the
# gummy mouth prompt. Both by Codex image generation on flat magenta,
# cleared to alpha and framed as body-picture.sh does.
#
# The pictures are made side by side; each takes a few minutes. Codex's
# log and pictures stay in the work directory printed at the start.
#
# Needs `codex` signed in, ImageMagick (`magick`) and `cwebp`.
set -eu

cd "$(dirname "$0")/.."

if [ $# -eq 0 ]; then
  echo "usage: jaw-picture.sh <id>..." >&2
  exit 2
fi

# Codex writes only under /tmp.
work=$(mktemp -d /tmp/jaw-picture.XXXXXX)
echo "jaw-picture: working in $work"

style() {
  awk -v heading="## $1" '$0 == heading { on = 1; next } on && /^## / { exit } on && /^> / { sub(/^> /, ""); printf "%s ", $0 }' art/style.md
}

# A Codex picture on magenta, cleared, trimmed and set in a frame.
clear() {
  magick "$1" -alpha set -fuzz 22% -transparent '#FF00FF' \
    -channel A -morphology Erode Disk:1 +channel \
    -trim +repage -resize "$3" -background none -gravity center -extent "$4" "$2"
}

jaw() {
  id=$1
  line=$(awk '/^## Jaws/ { on = 1 } on' art/prompts.md | sed -n "s/^- \`$id\`: //p")
  if [ -z "$line" ]; then
    echo "jaw-picture: no jaw prompt for $id in art/prompts.md" >&2
    return 1
  fi
  magick src/assets/dinos/tyrannosaurus/body.webp "$work/$id-style.png"
  codex exec --skip-git-repo-check -C "$work" -s workspace-write -c approval_policy=never \
    -i "$work/$id-style.png" -- \
    "Use your image generation tool to make a new picture. The attached picture is ONLY a style reference: match its picture-book style, line weight, shading and colour feel, but draw only a jaw. $(style "Jaw style prompt") Draw: $line Landscape 4:3 canvas. Save the result as $work/$id-jaw.png and reply only with the saved path." \
    < /dev/null > "$work/$id-jaw.log" 2>&1
  if [ ! -f "$work/$id-jaw.png" ]; then
    echo "jaw-picture: Codex made no jaw of $id; see $work/$id-jaw.log" >&2
    return 1
  fi
  clear "$work/$id-jaw.png" "$work/$id-jaw-alpha.png" 570x420 600x450
  mkdir -p src/assets/jaws
  cwebp -quiet -q 85 -alpha_q 90 "$work/$id-jaw-alpha.png" -o "src/assets/jaws/$id.webp"
  echo "jaw-picture: src/assets/jaws/$id.webp"
}

gummy() {
  id=$1
  magick src/assets/dinos/"$id"/body.webp -background '#FF00FF' -flatten "$work/$id-body.png"
  codex exec --skip-git-repo-check -C "$work" -s workspace-write -c approval_policy=never \
    -i "$work/$id-body.png" -- \
    "Use your image generation tool to edit the attached picture. $(style "Gummy mouth prompt") Landscape 4:3 canvas. Save the result as $work/$id-gummy.png and reply only with the saved path." \
    < /dev/null > "$work/$id-gummy.log" 2>&1
  if [ ! -f "$work/$id-gummy.png" ]; then
    echo "jaw-picture: Codex made no gummy mouth of $id; see $work/$id-gummy.log" >&2
    return 1
  fi
  clear "$work/$id-gummy.png" "$work/$id-gummy-alpha.png" 760x560 800x600
  cwebp -quiet -q 85 -alpha_q 90 "$work/$id-gummy-alpha.png" -o "src/assets/dinos/$id/gummy.webp"
  echo "jaw-picture: src/assets/dinos/$id/gummy.webp"
}

pids=
for id in "$@"; do
  jaw "$id" &
  pids="$pids $!"
  gummy "$id" &
  pids="$pids $!"
done
failed=0
for pid in $pids; do
  wait "$pid" || failed=1
done
exit $failed
