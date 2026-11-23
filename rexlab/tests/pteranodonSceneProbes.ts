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
  [434, 174, "sky"], [101, 334, "sky-left"], [803, 230, "sky-right"], [160, 86, "sun"], [563, 83, "cloud-1"],
  [151, 278, "cloud-2"], [786, 307, "cloud-3"], [417, 395, "hill-far"], [202, 483, "hill-left"], [305, 453, "hill-ridge"],
  [429, 469, "hill-front"], [579, 464, "hill-low"], [678, 440, "hill-right"], [625, 489, "hill-far-right"], [350, 528, "sea-near"],
  [385, 560, "sea-far"], [740, 453, "cliff-top"], [776, 514, "cliff-face-1"], [824, 444, "cliff-face-2"], [625, 565, "cliff-base"],
  [705, 568, "stone-left"], [783, 573, "stone-right"], [145, 411, "wing-left-panel-1"], [242, 357, "wing-left-panel-2"], [326, 345, "wing-left-panel-3"],
  [475, 349, "body"], [411, 298, "neck"], [317, 205, "head"], [225, 183, "beak"], [352, 122, "crest-1"],
  [382, 90, "crest-2"], [423, 60, "crest-3"], [624, 228, "wing-right-panel-1"], [717, 177, "wing-right-panel-2"], [781, 104, "wing-right-panel-3"],
  [561, 344, "wing-right-arm"]
];

// Eye ink in the traced Explorer scene.
export const pteranodonExplorerProtectedProbes: readonly (readonly [number, number])[] = [
  [270, 166]
];
