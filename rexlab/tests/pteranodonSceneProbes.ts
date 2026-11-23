// Interior landmarks use the persisted 920 × 620 drawing coordinates.
export const pteranodonHatchlingProbes: readonly (readonly [number, number, string])[] = [
  [460, 570, "sea"], [160, 420, "cloud"], [410, 440, "leg-left"], [510, 440, "leg-right"],
  [260, 240, "wing-left"], [660, 240, "wing-right"], [460, 320, "body"],
  [340, 70, "crest"], [620, 84, "beak"], [440, 100, "head"]
];

export const pteranodonExplorer1Probes: readonly (readonly [number, number, string])[] = [
  [80, 360, "sky"], [824, 84, "sun"], [120, 100, "cloud-high"], [300, 440, "cloud-low"], [480, 580, "sea"],
  [800, 540, "cliff-right"], [800, 430, "cliff-right-top"], [120, 560, "cliff-left"], [80, 470, "cliff-left-top"],
  [410, 440, "leg-left"], [510, 440, "leg-right"],
  [220, 296, "wing-left"], [260, 180, "wing-left-arm"], [700, 296, "wing-right"], [660, 180, "wing-right-arm"],
  [460, 220, "body"], [460, 340, "belly"], [380, 80, "crest"], [300, 50, "crest-tip"],
  [620, 84, "beak"], [640, 114, "jaw"], [440, 100, "head"]
];

// Eye and toe ink in the Hatchling and first Explorer scenes.
export const pteranodonProtectedProbes: readonly (readonly [number, number])[] = [
  [476, 84], [374, 482]
];

// One interior point per region of the traced Explorer scene.
export const pteranodonExplorerProbes: readonly (readonly [number, number, string])[] = [
  [432, 162, "sky"], [208, 251, "sky-left"], [831, 224, "sky-right"], [134, 67, "sun"], [573, 64, "cloud-1"],
  [124, 276, "cloud-2"], [815, 308, "cloud-3"], [413, 403, "hill-far"], [180, 498, "hill-left"], [292, 466, "hill-ridge"],
  [427, 483, "hill-front"], [590, 478, "hill-low"], [697, 452, "hill-right"], [640, 505, "hill-far-right"], [341, 547, "sea-near"],
  [378, 583, "sea-far"], [765, 466, "cliff-top"], [804, 532, "cliff-face-1"], [855, 455, "cliff-face-2"], [640, 587, "cliff-base"],
  [727, 590, "stone-left"], [811, 595, "stone-right"], [118, 420, "wing-left-panel-1"], [224, 362, "wing-left-panel-2"], [315, 349, "wing-left-panel-3"],
  [476, 353, "body"], [407, 297, "neck"], [305, 196, "head"], [205, 172, "beak"], [343, 106, "crest-1"],
  [375, 71, "crest-2"], [420, 38, "crest-3"], [639, 221, "wing-right-panel-1"], [739, 165, "wing-right-panel-2"], [810, 86, "wing-right-panel-3"],
  [570, 347, "wing-right-arm"]
];

// Eye ink in the traced Explorer scene.
export const pteranodonExplorerProtectedProbes: readonly (readonly [number, number])[] = [
  [254, 154]
];

// The same points in the earlier traced scene, framed in a margin.
export const pteranodonExplorer2Probes: readonly (readonly [number, number, string])[] = [
  [434, 174, "sky"], [101, 334, "sky-left"], [803, 230, "sky-right"], [160, 86, "sun"], [563, 83, "cloud-1"],
  [151, 278, "cloud-2"], [786, 307, "cloud-3"], [417, 395, "hill-far"], [202, 483, "hill-left"], [305, 453, "hill-ridge"],
  [429, 469, "hill-front"], [579, 464, "hill-low"], [678, 440, "hill-right"], [625, 489, "hill-far-right"], [350, 528, "sea-near"],
  [385, 560, "sea-far"], [740, 453, "cliff-top"], [776, 514, "cliff-face-1"], [824, 444, "cliff-face-2"], [625, 565, "cliff-base"],
  [705, 568, "stone-left"], [783, 573, "stone-right"], [145, 411, "wing-left-panel-1"], [242, 357, "wing-left-panel-2"], [326, 345, "wing-left-panel-3"],
  [475, 349, "body"], [411, 298, "neck"], [317, 205, "head"], [225, 183, "beak"], [352, 122, "crest-1"],
  [382, 90, "crest-2"], [423, 60, "crest-3"], [624, 228, "wing-right-panel-1"], [717, 177, "wing-right-panel-2"], [781, 104, "wing-right-panel-3"],
  [561, 344, "wing-right-arm"]
];

// Eye ink in the earlier traced scene.
export const pteranodonExplorer2ProtectedProbes: readonly (readonly [number, number])[] = [
  [270, 166]
];
