// Interior landmarks use the persisted 920 × 620 drawing coordinates.
export const trexHatchlingProbes: readonly (readonly [number, number, string])[] = [
  [700, 570, "ground"],
  [270, 350, "tail"],
  [547, 480, "leg-far"],
  [456, 366, "body"],
  [622, 310, "arm-far"],
  [418, 485, "leg-near"],
  [704, 179, "head"],
  [582, 352, "arm-near"],
  [94, 516, "plant-left"],
  [153, 492, "plant-crown"],
  [203, 515, "plant-right"]
];

export const trexExplorerProbes: readonly (readonly [number, number, string])[] = [
  [325, 82, "sun"],
  [110, 112, "cloud"],
  [383, 251, "ridge"],
  [778, 422, "hills"],
  ...trexHatchlingProbes.slice(0, 1),
  [168, 371, "cycad-trunk"],
  [90, 194, "cycad-left"],
  [150, 151, "cycad-crown"],
  [211, 190, "cycad-right"],
  [350, 380, "tail"],
  [278, 348, "tail-mark"],
  ...trexHatchlingProbes.slice(2, 3),
  [490, 359, "body"],
  [574, 312, "belly"],
  [445, 334, "back-mark"],
  ...trexHatchlingProbes.slice(4, 6),
  [452, 438, "thigh-mark"],
  ...trexHatchlingProbes.slice(6, 8),
  [285, 554, "rock"],
  [329, 554, "rock-face"],
  ...trexHatchlingProbes.slice(8)
];

export const trexProtectedProbes: readonly (readonly [number, number])[] = [
  [584, 174], [580, 162], [794, 169], [714, 248],
  [80, 210], [460, 584], [550, 556], [608, 378]
];
