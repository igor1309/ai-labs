#!/usr/bin/env python3
# Cuts a skeleton's pieces for every age level from the cut lines in
# art/skeleton-cuts.json (art/skeletons.md): Hatchling's from the whole
# skeleton.webp, Explorer's from Hatchling's pieces and Paleontologist's
# from Explorer's, each piece's place in the 800x600 frame. It writes
# each piece as src/assets/skeletons/<id>/<piece>.webp, losslessly, and
# the cuts of the skeleton's entry in src/data/skeletons.json, keeping its
# fact and distractors.
#
# A piece takes the pixels of its source inside its region, the polygons
# in the frame, outlines included, that no piece before it in the cut has
# taken; the source's piece with no region takes the rest. A piece that is
# the whole of a source of its own id is that source's file.
#
#   cut-skeleton.py <id> [--levels explorer,paleontologist] [--preview DIR]
#
# --levels cuts only the levels named, reading the others' pieces from
# their files; --preview writes nothing but DIR/<id>-<level>.png, each
# level's pieces in colours over a grid, to check the cut lines.
#
# Needs Python 3 with Pillow.
import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
LEVELS = ["hatchling", "explorer", "paleontologist"]
FRAME = (800, 600)
COLOURS = [(230, 60, 60), (60, 160, 230), (80, 190, 90), (240, 170, 40), (170, 90, 220), (40, 200, 200), (220, 100, 170), (140, 140, 40), (120, 70, 30), (30, 60, 150), (250, 120, 90), (90, 90, 90)]


def framed(picture, x, y):
    frame = Image.new("RGBA", FRAME, (0, 0, 0, 0))
    frame.paste(picture.convert("RGBA"), (x, y))
    return frame


def region_mask(polygons):
    mask = Image.new("L", FRAME, 0)
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        draw.polygon([tuple(point) for point in polygon], fill=255, outline=255)
    return mask


# The cut of one level: each piece's frame and place, from its sources'
# frames.
def cut_level(level, pieces, sources):
    taken = {source: Image.new("L", FRAME, 0) for source in sources}
    masks = {}
    for piece in pieces:
        if "region" in piece:
            mask = ImageChops.subtract(region_mask(piece["region"]), taken[piece["from"]])
            masks[piece["id"]] = mask
            taken[piece["from"]] = ImageChops.lighter(taken[piece["from"]], mask)
    for piece in pieces:
        if "region" not in piece:
            masks[piece["id"]] = ImageChops.invert(taken[piece["from"]])
    cut = {}
    for piece in pieces:
        source = sources[piece["from"]]
        if piece["id"] == piece["from"] and "region" not in piece and taken[piece["from"]].getbbox() is None:
            cut[piece["id"]] = source
            continue
        frame = Image.composite(source, Image.new("RGBA", FRAME, (0, 0, 0, 0)), masks[piece["id"]])
        if frame.getchannel("A").getbbox() is None:
            raise SystemExit(f"{level} piece {piece['id']} takes no pixel of {piece['from']}")
        cut[piece["id"]] = frame
    return cut


def place(frame):
    x0, y0, x1, y1 = frame.getchannel("A").getbbox()
    return {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}


def preview(id, level, pieces, cut, out):
    picture = Image.new("RGBA", FRAME, (255, 255, 255, 255))
    for at, piece in enumerate(pieces):
        tint = Image.new("RGBA", FRAME, COLOURS[at % len(COLOURS)] + (255,))
        tint.putalpha(cut[piece["id"]].getchannel("A"))
        picture.alpha_composite(tint)
    draw = ImageDraw.Draw(picture)
    for x in range(0, FRAME[0], 50):
        draw.line([(x, 0), (x, FRAME[1])], fill=(0, 0, 0, 60))
        draw.text((x + 2, 2), str(x), fill=(0, 0, 0, 255))
    for y in range(0, FRAME[1], 50):
        draw.line([(0, y), (FRAME[0], y)], fill=(0, 0, 0, 60))
        draw.text((2, y + 2), str(y), fill=(0, 0, 0, 255))
    picture.convert("RGB").save(out / f"{id}-{level}.png")


def main():
    parser = argparse.ArgumentParser(description="Cut a skeleton's pieces for every age level.")
    parser.add_argument("id")
    parser.add_argument("--levels", default=",".join(LEVELS))
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()
    wanted = args.levels.split(",")
    if not set(wanted) <= set(LEVELS):
        raise SystemExit(f"--levels names levels of {LEVELS} only")

    cuts = json.loads((ROOT / "art/skeleton-cuts.json").read_text())
    if args.id not in cuts:
        raise SystemExit(f"art/skeleton-cuts.json has no cut lines for {args.id}")
    places_path = ROOT / "src/data/skeletons.json"
    places = json.loads(places_path.read_text())
    entry = places["dinosaurs"].setdefault(args.id, {})
    pictures = ROOT / "src/assets/skeletons" / args.id

    sources = {"skeleton": framed(Image.open(pictures / "skeleton.webp"), 0, 0)}
    for level in LEVELS:
        pieces = cuts[args.id][level]
        if level in wanted:
            cut = cut_level(level, pieces, sources)
        else:
            filed = {piece["id"]: piece for piece in entry["cuts"][level]}
            cut = {id: framed(Image.open(pictures / f"{id}.webp"), filed[id]["x"], filed[id]["y"]) for id in filed}
        if args.preview:
            args.preview.mkdir(parents=True, exist_ok=True)
            preview(args.id, level, pieces, cut, args.preview)
        elif level in wanted:
            filed = []
            for piece in pieces:
                frame = cut[piece["id"]]
                at = place(frame)
                if frame is not sources.get(piece["id"]):
                    frame.crop((at["x"], at["y"], at["x"] + at["width"], at["y"] + at["height"])).save(pictures / f"{piece['id']}.webp", lossless=True, exact=True)
                filed.append({"id": piece["id"], "area": piece["area"], "name": piece["name"], **at})
            entry.setdefault("cuts", {})[level] = filed
        sources = cut

    if not args.preview:
        places_path.write_text(json.dumps(places, indent=2, ensure_ascii=False) + "\n")


main()
