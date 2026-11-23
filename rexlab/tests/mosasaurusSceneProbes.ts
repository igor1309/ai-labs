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
export const mosasaurusExplorer2Probes: readonly (readonly [number, number, string])[] = [
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
export const mosasaurusExplorer2ProtectedProbes: readonly (readonly [number, number])[] = [
  [216, 152], [114, 185], [196, 366]
];

// The traced Explorer scene that covers the whole canvas.
export const mosasaurusExplorerProbes: readonly (readonly [number, number, string])[] = [
  [74, 30, "sky"], [807, 129, "water"], [141, 88, "water-left"], [284, 84, "light-ray-left"], [549, 118, "water-top"],
  [663, 128, "light-ray-right"], [725, 298, "seabed"], [221, 562, "rock-left"], [605, 565, "rock-right"], [371, 567, "ammonite-1"],
  [362, 507, "ammonite-2"], [415, 472, "ammonite-3"], [464, 490, "ammonite-4"], [471, 534, "ammonite-5"], [212, 392, "fish-left"],
  [629, 425, "fish-right"], [101, 459, "kelp-left-1"], [169, 488, "kelp-left-2"], [725, 506, "kelp-right-1"], [792, 463, "kelp-right-2"],
  [830, 516, "kelp-right-3"], [189, 283, "flipper-far-front"], [542, 322, "flipper-far-back"], [798, 242, "tail-tip"], [832, 314, "tail-fin"],
  [302, 174, "back-band-1"], [374, 197, "back-band-2"], [453, 232, "back-band-3"], [527, 230, "back-band-4"], [593, 223, "back-band-5"],
  [653, 218, "tail-band-1"], [707, 212, "tail-band-2"], [450, 295, "belly"], [263, 230, "head"], [396, 325, "flipper-near-front"],
  [615, 310, "flipper-near-back"], [81, 515, "kelp-left-3"], [854, 559, "seabed-right"], [727, 593, "rock-middle"]
];

// The same ink points as the previous traced scene, moved with the picture.
export const mosasaurusExplorerProtectedProbes: readonly (readonly [number, number])[] = [
  [174, 125], [63, 164], [146, 384]
];
