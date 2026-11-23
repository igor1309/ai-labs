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
export const brachiosaurusExplorer2Probes: readonly (readonly [number, number, string])[] = [
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
export const brachiosaurusExplorer2ProtectedProbes: readonly (readonly [number, number])[] = [
  [713, 70], [574, 515]
];

// The traced Explorer scene that covers the whole canvas.
export const brachiosaurusExplorerProbes: readonly (readonly [number, number, string])[] = [
  [302, 191, "sky"], [829, 295, "sky-right"], [181, 70, "sun"], [140, 165, "cloud-1"], [385, 70, "cloud-2"],
  [542, 146, "cloud-3"], [319, 318, "hill-left"], [722, 355, "hill-middle"], [846, 342, "hill-right"], [795, 375, "tree-trunk"],
  [83, 417, "lake"], [270, 515, "meadow"], [766, 451, "bush-right"], [103, 533, "bush-left"], [613, 587, "ground"],
  [374, 518, "ground-under-hind"], [488, 512, "ground-under-belly"], [600, 510, "ground-under-front"], [418, 502, "leg-far-hind"], [631, 457, "leg-far-front"],
  [152, 470, "tail-tip"], [207, 465, "tail-band-3"], [255, 453, "tail-band-2"], [304, 438, "tail-band-1"], [490, 392, "flank"],
  [420, 445, "belly"], [449, 328, "back-patch-1"], [518, 294, "back-patch-2"], [629, 284, "neck-band-1"], [639, 242, "neck-band-2"],
  [647, 196, "neck-band-3"], [654, 152, "neck-band-4"], [702, 70, "head"], [364, 407, "leg-near-hind"], [579, 343, "leg-near-front"],
  [464, 590, "stone-middle"], [214, 590, "stone-left"], [726, 594, "stone-right"]
];

// The same ink points as the previous traced scene, moved with the picture.
export const brachiosaurusExplorerProtectedProbes: readonly (readonly [number, number])[] = [
  [756, 32], [597, 558]
];
