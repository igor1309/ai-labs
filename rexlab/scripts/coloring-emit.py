# Writes a traced picture as a coloring geometry module (art/coloring.md).
#
#   coloring-emit.py <traced.json> <names.json> <CONST> <version> <out.ts>
#
# names.json maps each traced id to a region name, in paint order; the probes
# printed are one interior point per region for the scene's tests.
import sys, json, re
d = json.load(open(sys.argv[1])); names = json.load(open(sys.argv[2])); const, version = sys.argv[3], sys.argv[4]
byid = {r["id"]: r for r in d["regions"]}; rs = [byid[k] for k in names]
out = ['import type { Geometry, PaintRegion, ProtectedDetail } from "./geometry.ts";', "",
 "// Traced from generated line art: regions tile the picture under one protected ink layer.",
 "const regions: readonly PaintRegion[] = ["]
# Background shows the paper until filled: areas that run off the page, and the
# land, water and sky between the things drawn.
BACKGROUND = re.compile(r"^(sky|hill|plain|meadow|ground|water|seabed|bank|far-bank|light-ray|river|shore)(-|$)")
def is_open(r): return r.get("open") or BACKGROUND.match(names[r["id"]])
out += [f'  {{ id: "{names[r["id"]]}", x: 0, y: 0, path: "{r["path"]}", outline: 0{", open: true" if is_open(r) else ""} }},' for r in rs]
out += ["];", "", "const details: readonly ProtectedDetail[] = [",
 f'  {{ x: 0, y: 0, path: "{d["ink"]}", fill: "#091e40" }}', "];", "",
 f"export const {const}: Geometry = {{",
 f'  artwork: Object.freeze({{ version: "{version}", regions: Object.freeze(regions.map(({{ id }}) => id)) }}),',
 "  regions, details", "};", ""]
open(sys.argv[5], "w").write("\n".join(out))
print("probes:", json.dumps([[*r["probe"], names[r["id"]]] for r in rs]))
