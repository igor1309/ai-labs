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

export const trexExplorer1Probes: readonly (readonly [number, number, string])[] = [
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

export const trexExplorer2Probes: readonly (readonly [number, number, string])[] = [
  [366, 106, "sky"], [70, 70, "sun"], [508, 92, "cloud-1"], [788, 54, "cloud-2"], [238, 78, "smoke"],
  [154, 258, "volcano"], [242, 150, "lava"], [146, 342, "ridge"], [230, 464, "plain"], [636, 472, "pond"],
  [784, 564, "ground"], [104, 548, "rock"], [174, 558, "rock-face"], [288, 560, "fern"], [828, 524, "cycad-trunk"],
  [764, 370, "cycad-left"], [824, 326, "cycad-crown"], [870, 366, "cycad-right"], [542, 434, "leg-far"], [190, 212, "tail"],
  [140, 196, "tail-stripe-1"], [238, 204, "tail-stripe-2"], [338, 220, "tail-stripe-3"], [686, 244, "body"], [472, 222, "back-stripe-1"],
  [550, 218, "back-stripe-2"], [620, 228, "back-stripe-3"], [586, 360, "belly"], [628, 334, "arm-far"], [440, 460, "leg-near"],
  [420, 388, "thigh"], [406, 318, "hip-patch"], [826, 180, "head"], [782, 130, "brow"], [726, 198, "jaw-muscle"],
  [746, 238, "lower-jaw"], [672, 310, "arm-near"]
];

// Eye and toe ink in the Explorer scene.
export const trexExplorer2ProtectedProbes: readonly (readonly [number, number])[] = [
  [798, 158], [444, 554]
];

export const trexProtectedProbes: readonly (readonly [number, number])[] = [
  [584, 174], [580, 162], [794, 169], [714, 248],
  [80, 210], [460, 584], [550, 556], [608, 378]
];

export const trexExplorer3Probes: readonly (readonly [number, number, string])[] = [
  [368, 106, "sky"], [70, 66, "sun"], [508, 92, "cloud-1"], [680, 42, "cloud-2"], [220, 52, "smoke"],
  [282, 168, "volcano"], [250, 122, "lava"], [754, 302, "far-hills"], [160, 332, "hills"], [92, 460, "plain"],
  [244, 442, "pond"], [406, 564, "ground"], [838, 526, "tree-trunk"], [812, 398, "tree-crown-1"], [836, 326, "tree-crown-2"],
  [832, 258, "tree-crown-3"], [84, 540, "rock"], [130, 566, "rock-face"], [276, 574, "fern-1"], [744, 568, "fern-2"],
  [556, 422, "leg-far"], [256, 250, "tail"], [138, 208, "tail-stripe-1"], [220, 210, "tail-stripe-2"], [302, 226, "tail-stripe-3"],
  [700, 252, "body"], [362, 236, "back-stripe-1"], [542, 208, "back-stripe-2"], [614, 214, "back-stripe-3"], [676, 196, "back-stripe-4"],
  [596, 362, "belly"], [468, 434, "leg-near"], [452, 338, "thigh"], [648, 322, "arm-far"], [830, 140, "head"],
  [736, 214, "lower-jaw"], [688, 308, "arm-near"]
];

// Eye and nostril or fish-eye ink in the current Explorer scene.
export const trexExplorer3ProtectedProbes: readonly (readonly [number, number])[] = [
  [795, 119], [875, 129]
];

// Interior probes of the traced Explorer scene, in region order.
export const trexExplorer4Probes: readonly (readonly [number, number, string])[] = [
  [419, 74, "sky"], [524, 86, "sun"], [202, 76, "cloud-1"], [749, 70, "cloud-2"], [91, 188, "hill-left"],
  [351, 156, "hill-far"], [437, 188, "hill-near"], [828, 189, "hill-right"], [621, 182, "volcano"], [697, 211, "lava"],
  [789, 216, "volcano-slope"], [220, 325, "plain"], [111, 387, "pond"], [308, 462, "meadow"], [451, 462, "ground"],
  [108, 548, "ground-left"], [303, 565, "stone-left"], [461, 551, "stone-big"], [649, 562, "stone-right"], [181, 454, "cycad"],
  [711, 476, "bush-leaf-1"], [717, 425, "bush-leaf-2"], [796, 426, "bush-leaf-3"], [794, 478, "bush-leaf-4"], [346, 419, "leg-far"],
  [396, 374, "belly"], [282, 291, "throat"], [300, 190, "back-stripe-1"], [363, 268, "back-stripe-2"], [413, 266, "back-stripe-3"],
  [464, 251, "back-stripe-4"], [514, 264, "back-stripe-5"], [564, 281, "back-stripe-6"], [612, 318, "tail-stripe-1"], [661, 326, "tail-stripe-2"],
  [712, 328, "tail-stripe-3"], [760, 322, "tail-stripe-4"], [513, 347, "leg-near"], [171, 216, "head"], [247, 254, "lower-jaw"]
];

// Eye, far-foot outline and teeth ink in the traced Explorer scene.
export const trexExplorer4ProtectedProbes: readonly (readonly [number, number])[] = [
  [219, 190], [293, 497], [110, 262]
];

// The traced Explorer scene that covers the whole canvas.
export const trexExplorerProbes: readonly (readonly [number, number, string])[] = [
  [416, 55, "sky"], [530, 67, "sun"], [180, 57, "cloud-1"], [773, 51, "cloud-2"], [63, 176, "hill-left"],
  [342, 143, "hill-far"], [435, 179, "hill-near"], [856, 178, "hill-right"], [634, 172, "volcano"], [717, 203, "lava"],
  [817, 209, "volcano-slope"], [199, 327, "plain"], [85, 394, "pond"], [295, 476, "meadow"], [450, 475, "ground"],
  [80, 566, "ground-left"], [289, 587, "stone-left"], [461, 572, "stone-big"], [665, 584, "stone-right"], [158, 466, "cycad"],
  [733, 490, "bush-leaf-1"], [738, 436, "bush-leaf-2"], [825, 437, "bush-leaf-3"], [822, 493, "bush-leaf-4"], [337, 428, "leg-far"],
  [390, 380, "belly"], [267, 290, "throat"], [287, 181, "back-stripe-1"], [355, 265, "back-stripe-2"], [409, 262, "back-stripe-3"],
  [464, 246, "back-stripe-4"], [518, 261, "back-stripe-5"], [572, 279, "back-stripe-6"], [625, 319, "tail-stripe-1"], [678, 328, "tail-stripe-2"],
  [733, 330, "tail-stripe-3"], [785, 323, "tail-stripe-4"], [518, 351, "leg-near"], [146, 209, "head"], [229, 250, "lower-jaw"],
  [307, 260, "neck"], [737, 265, "plain-right"]
];

// The same ink points as the previous traced scene, moved with the picture.
export const trexExplorerProtectedProbes: readonly (readonly [number, number])[] = [
  [183, 170], [264, 527], [47, 235]
];
