# Home skeleton

`tyrannosaurus.glb` is adapted from **Tyrannosaurus rex skeleton** by
[Rigsters](https://rigsters.com/), a photogrammetric capture of the replica
in Knuthenborg Safaripark, Denmark.

- Source: [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Tyrannosaurus_rex_skeleton.stl),
  mirrored from [Rigsters on Sketchfab](https://sketchfab.com/3d-models/tyrannosaurus-rex-skeleton-77e21c4e5d65468bbe11780ae0557b95).
- Licence: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
- Modifications by RexLab: welded vertices, simplified the scanned mesh from
  250,518 to 39,990 triangles (19,798 vertices), reoriented and centered it,
  recalculated smooth normals, and applied a warm ivory material. The local
  binary glTF is 716,348 bytes, down from the 12,525,984-byte STL. It contains
  no textures or external resources. The app adds a gentle whole-model yaw.

The static fallback is the existing RexLab Tyrannosaurus skeleton picture.

## Assembly hero

`assembly.glb` contains the approved procedural standing body and an extracted head from `tyrannosaurus.glb` above. The scanned head was trimmed, scaled, rotated and recolored; its Rigsters CC BY 4.0 attribution applies. Each bone group includes assembly start, end, rotation and timing metadata. Identical geometry is shared to keep the asset below two megabytes. `standing.png` is the completed-pose fallback rendered from this scene.
