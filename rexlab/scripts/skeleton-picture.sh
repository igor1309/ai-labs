#!/bin/sh
# Makes the whole skeleton picture of each dinosaur named,
# src/assets/skeletons/<id>/skeleton.webp, traced by Codex image
# generation from its body picture in the same pose and framing, so the
# body lies over it (art/skeletons.md). Codex's picture is made 800x600,
# its white background and the white between bones cleared to alpha.
#
# The dinosaurs are made side by side; each takes a few minutes. Codex's
# log and pictures stay in the work directory printed at the start.
#
# Needs `codex` signed in, ImageMagick (`magick`) and `cwebp`.
set -eu

cd "$(dirname "$0")/.."

if [ $# -eq 0 ]; then
  echo "usage: skeleton-picture.sh <id>..." >&2
  exit 2
fi

# Codex writes only under /tmp.
work=$(mktemp -d /tmp/skeleton-picture.XXXXXX)
echo "skeleton-picture: working in $work"

make() {
  id=$1
  body=src/assets/dinos/$id/body.webp
  if [ ! -f "$body" ]; then
    echo "skeleton-picture: no body picture at $body" >&2
    return 1
  fi
  magick "$body" "$work/$id-body.png"
  # -- ends --image's list: the prompt is not a picture.
  codex exec --skip-git-repo-check -C "$work" -s workspace-write -c approval_policy=never \
    -i "$work/$id-body.png" -- \
    "Use your image generation tool to edit the attached picture of a $id. Produce the same dinosaur's fossil skeleton in EXACTLY the same pose, position, size and framing as the attached picture, so the skeleton lines up under the body when the two images are overlaid: same head position, same leg positions, same tail curve. Children's picture-book style: warm ivory bones with soft shading and a clean dark outline, few chunky clearly separated bones a 6-year-old can read (big skull, backbone with chunky ribs, legs, tail). Plain flat white background, no ground, no shadow, no text. Same canvas proportions as the input (4:3). Save the result as $work/$id-skeleton.png and reply only with the saved path." \
    < /dev/null > "$work/$id.log" 2>&1
  if [ ! -f "$work/$id-skeleton.png" ]; then
    echo "skeleton-picture: Codex made no picture of $id; see $work/$id.log" >&2
    return 1
  fi
  magick "$work/$id-skeleton.png" -resize '800x600!' -alpha set -fuzz 7% -transparent white "$work/$id-alpha.png"
  mkdir -p "src/assets/skeletons/$id"
  cwebp -quiet -q 85 -alpha_q 90 "$work/$id-alpha.png" -o "src/assets/skeletons/$id/skeleton.webp"
  # The body at half strength over the skeleton, to check they line up.
  magick "$work/$id-alpha.png" -background white -flatten \
    \( "$work/$id-body.png" -alpha set -channel A -evaluate multiply 0.45 +channel \) \
    -compose over -composite "$work/$id-overlay.png"
  echo "skeleton-picture: src/assets/skeletons/$id/skeleton.webp; check $work/$id-overlay.png"
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
