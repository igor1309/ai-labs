// Interior landmarks use the persisted 920 × 620 drawing coordinates.
export const mosasaurusHatchlingProbes: readonly (readonly [number, number, string])[] = [
  [478, 560, "sand"],
  [102, 258, "tail-fin"],
  [286, 310, "tail"],
  [332, 360, "flipper-far-back"],
  [676, 354, "flipper-far-front"],
  [568, 256, "body"],
  [402, 416, "flipper-near-back"],
  [576, 360, "flipper-near-front"],
  [786, 232, "head"],
  [132, 468, "weed-left"],
  [226, 442, "weed-middle"],
  [822, 492, "weed-right"]
];

export const mosasaurusExplorer1Probes: readonly (readonly [number, number, string])[] = [
  [258, 70, "sky"],
  [112, 124, "water"],
  [784, 128, "fish-top"],
  [668, 468, "fish-low"],
  [484, 560, "sand"],
  [612, 556, "rock"],
  [658, 540, "rock-face"],
  [298, 560, "ammonite"],
  [102, 258, "tail-fin"],
  [212, 312, "tail"],
  [270, 310, "tail-mark"],
  [332, 360, "flipper-far-back"],
  [676, 354, "flipper-far-front"],
  [548, 288, "body"],
  [516, 360, "belly"],
  [586, 226, "back-mark"],
  [402, 416, "flipper-near-back"],
  [576, 360, "flipper-near-front"],
  [824, 238, "head"],
  [774, 204, "head-mark"],
  [132, 468, "weed-left"],
  [226, 442, "weed-middle"],
  [822, 502, "weed-right"]
];

// Eye, smile, teeth, paddle bones and wave ink in both scenes.
export const mosasaurusProtectedProbes: readonly (readonly [number, number])[] = [
  [742, 216], [888, 256], [856, 262], [572, 372], [60, 120]
];

// The traced Explorer scene: one interior point per region, in paint order.
export const mosasaurusExplorerProbes: readonly (readonly [number, number, string])[] = [
  [798, 49, "sky"], [782, 144, "water"], [166, 105, "water-left"], [297, 101, "light-ray-left"], [541, 133, "water-top"],
  [646, 142, "light-ray-right"], [698, 571, "seabed"], [240, 541, "rock-left"], [593, 544, "rock-right"], [378, 546, "ammonite-1"],
  [370, 491, "ammonite-2"], [418, 458, "ammonite-3"], [463, 475, "ammonite-4"], [470, 516, "ammonite-5"], [231, 385, "fish-left"],
  [615, 415, "fish-right"], [130, 446, "kelp-left-1"], [192, 473, "kelp-left-2"], [703, 490, "kelp-right-1"], [765, 450, "kelp-right-2"],
  [800, 499, "kelp-right-3"], [210, 285, "flipper-far-front"], [535, 321, "flipper-far-back"], [771, 247, "tail-tip"], [801, 314, "tail-fin"],
  [314, 184, "back-band-1"], [381, 205, "back-band-2"], [453, 238, "back-band-3"], [521, 236, "back-band-4"], [582, 230, "back-band-5"],
  [637, 225, "tail-band-1"], [686, 219, "tail-band-2"], [451, 295, "belly"], [278, 236, "head"], [400, 323, "flipper-near-front"],
  [602, 310, "flipper-near-back"]
];

// Eye, teeth and a fish eye ink in the traced Explorer scene.
export const mosasaurusExplorerProtectedProbes: readonly (readonly [number, number])[] = [
  [216, 152], [114, 185], [196, 366]
];
