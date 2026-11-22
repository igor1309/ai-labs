// Interior landmarks use the persisted 920 × 620 drawing coordinates.
export const brachiosaurusHatchlingProbes: readonly (readonly [number, number, string])[] = [
  [400, 592, "ground"],
  [224, 404, "tail"],
  [464, 504, "leg-far-hind"],
  [644, 476, "leg-far-front"],
  [676, 188, "neck"],
  [512, 328, "body"],
  [796, 96, "head"],
  [392, 472, "leg-near-hind"],
  [572, 468, "leg-near-front"],
  [704, 520, "fern-left"],
  [764, 476, "fern-crown"],
  [836, 532, "fern-right"]
];

export const brachiosaurusExplorer1Probes: readonly (readonly [number, number, string])[] = [
  [332, 92, "sun"],
  [464, 108, "cloud"],
  [512, 464, "hills"],
  [448, 572, "ground"],
  [160, 380, "tree-trunk"],
  [160, 248, "tree-low"],
  [160, 132, "tree-top"],
  [848, 404, "tree-right-trunk"],
  [840, 248, "tree-right-crown"],
  [204, 412, "tail"],
  [276, 392, "tail-mark"],
  [464, 504, "leg-far-hind"],
  [644, 476, "leg-far-front"],
  [676, 188, "neck"],
  [516, 328, "body"],
  [476, 272, "back-mark"],
  [516, 408, "belly"],
  [796, 96, "head"],
  [392, 472, "leg-near-hind"],
  [572, 468, "leg-near-front"],
  [244, 544, "rock"],
  [292, 552, "rock-face"],
  [704, 520, "fern-left"],
  [764, 464, "fern-crown"],
  [836, 532, "fern-right"]
];

// Eye and toe ink in the Hatchling and first Explorer scenes.
export const brachiosaurusProtectedProbes: readonly (readonly [number, number])[] = [
  [774, 84], [380, 580]
];

// One interior point per region of the traced Explorer scene.
export const brachiosaurusExplorerProbes: readonly (readonly [number, number, string])[] = [
  [315, 200, "sky"], [800, 296, "sky-right"], [203, 89, "sun"], [165, 176, "cloud-1"], [390, 89, "cloud-2"],
  [536, 158, "cloud-3"], [330, 317, "hill-left"], [701, 352, "hill-middle"], [817, 340, "hill-right"], [769, 370, "tree-trunk"],
  [112, 408, "lake"], [285, 499, "meadow"], [741, 440, "bush-right"], [132, 515, "bush-left"], [607, 566, "ground"],
  [381, 502, "ground-under-hind"], [486, 496, "ground-under-belly"], [589, 494, "ground-under-front"], [233, 568, "stone-left"], [463, 567, "stone-middle"],
  [705, 571, "stone-right"], [422, 486, "leg-far-hind"], [617, 445, "leg-far-front"], [176, 457, "tail-tip"], [227, 452, "tail-band-3"],
  [271, 441, "tail-band-2"], [317, 427, "tail-band-1"], [487, 385, "flank"], [423, 434, "belly"], [450, 326, "back-patch-1"],
  [514, 295, "back-patch-2"], [616, 285, "neck-band-1"], [625, 247, "neck-band-2"], [632, 205, "neck-band-3"], [638, 164, "neck-band-4"],
  [683, 88, "head"], [371, 399, "leg-near-hind"], [569, 340, "leg-near-front"]
];

// Eye and toe ink in the traced Explorer scene.
export const brachiosaurusExplorerProtectedProbes: readonly (readonly [number, number])[] = [
  [713, 70], [574, 515]
];
